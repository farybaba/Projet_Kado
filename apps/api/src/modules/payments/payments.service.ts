import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Queue } from 'bull';
import { WebhookProvider } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ledger: LedgerService,
    @InjectQueue('settlements') private readonly settlementQueue: Queue,
    @InjectQueue('eme-instructions') private readonly emeQueue: Queue,
  ) {}

  // Vérifie la signature HMAC-SHA256 du webhook Wave
  verifyWaveWebhook(rawBody: Buffer, signature: string): void {
    const secret = this.config.get<string>('WAVE_WEBHOOK_SECRET');
    if (!secret) throw new Error('WAVE_WEBHOOK_SECRET manquant');

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Signature Wave invalide');
    }
  }

  verifyOmWebhook(rawBody: Buffer, signature: string): void {
    const secret = this.config.get<string>('OM_WEBHOOK_SECRET');
    if (!secret) throw new Error('OM_WEBHOOK_SECRET manquant');

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Signature Orange Money invalide');
    }
  }

  // Instruction de paiement EME — TOUJOURS via queue Bull (jamais synchrone)
  async enqueueEmeInstruction(payload: {
    voucherId: string;
    beneficiaryPhone: string;
    amount: number;
  }): Promise<void> {
    await this.emeQueue.add('issue-voucher', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
    });
  }

  // Reversement T+1 — cron à 23h00 UTC
  @Cron('0 23 * * *', { timeZone: 'UTC' })
  async scheduleDailySettlements(): Promise<void> {
    const merchants = await this.prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const merchant of merchants) {
      const reference = `SETTLE-${merchant.id}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

      // Idempotent — ignore si déjà réglé aujourd'hui
      const existing = await this.prisma.merchantSettlement.findUnique({
        where: { reference },
      });
      if (existing) continue;

      // Calcul solde dû
      const balance = await this.getMerchantBalance(merchant.id);
      if (balance <= 0) continue;

      await this.settlementQueue.add(
        'settle-merchant',
        { merchantId: merchant.id, amount: balance, reference },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
        },
      );
    }
  }

  async getMerchantBalance(merchantId: string): Promise<number> {
    const result = await this.prisma.ledgerEntry.aggregate({
      where: { merchantId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  // Traitement événement Wave payment.completed
  // Appelé de façon asynchrone (non-bloquant) après logWebhook
  async processWaveWebhook(webhookLogId: string, body: Record<string, unknown>): Promise<void> {
    // Idempotence : si le log est déjà PROCESSED, ne rien faire
    const log = await this.prisma.webhookLog.findUnique({ where: { id: webhookLogId } });
    if (!log) {
      this.logger.warn(`WebhookLog ${webhookLogId} introuvable`);
      return;
    }
    if (log.status === 'PROCESSED') return;

    const event = body['event'] as string | undefined;

    // Événements non pertinents — marquer PROCESSED sans action métier
    if (event !== 'payment.completed') {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    // Extraction de la référence EME depuis body.data.reference
    // Correspond au voucher.code passé lors de l'instruction EME
    const data = body['data'] as Record<string, unknown> | undefined;
    const emeReference = data?.['reference'] as string | undefined;

    if (!emeReference) {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: 'FAILED',
          error: 'Champ data.reference manquant dans le webhook Wave',
        },
      });
      return;
    }

    // Recherche du voucher par code (= référence EME transmise lors de l'instruction)
    const voucher = await this.prisma.voucher.findUnique({
      where: { code: emeReference },
    });

    if (!voucher) {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: 'FAILED',
          error: `Aucun voucher trouvé pour la référence EME : ${emeReference}`,
        },
      });
      return;
    }

    // Seuls les bons en statut PENDING peuvent être activés par ce webhook
    if (voucher.status !== 'PENDING') {
      // Déjà traité ou dans un état terminal — idempotent, on marque PROCESSED
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Activation du bon : PENDING → ISSUED
        await tx.voucher.update({
          where: { id: voucher.id },
          data: {
            status: 'ISSUED',
            emeConfirmedAt: new Date(),
          },
        });

        // Écriture ledger ISSUE : PROVISION_COMPANY:{cId} → VOUCHER_LIABILITY:{vId}
        await this.ledger.recordIssue(
          { tx },
          {
            voucherId: voucher.id,
            companyId: voucher.companyId,
            amount: voucher.nominalValue,
          },
        );

        // Marquer le webhook comme traité dans la même transaction
        await tx.webhookLog.update({
          where: { id: webhookLogId },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      });

      this.logger.log(`Bon ${voucher.id} activé via webhook Wave (ref: ${emeReference})`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erreur activation bon ${voucher.id} : ${errMsg}`);
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'FAILED', error: errMsg },
      }).catch(() => undefined);
    }
  }

  // Traitement événement Orange Money payment.completed
  async processOrangeMoneyWebhook(webhookLogId: string, body: Record<string, unknown>): Promise<void> {
    // Idempotence
    const log = await this.prisma.webhookLog.findUnique({ where: { id: webhookLogId } });
    if (!log) {
      this.logger.warn(`WebhookLog ${webhookLogId} introuvable`);
      return;
    }
    if (log.status === 'PROCESSED') return;

    // Orange Money : l'événement peut s'appeler 'payment.completed' ou 'transaction.success'
    // selon la version de l'API. On accepte les deux.
    const event = body['event'] as string | undefined;
    const isPaymentCompleted =
      event === 'payment.completed' || event === 'transaction.success';

    if (!isPaymentCompleted) {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    // OM : référence dans body.data.reference ou body.reference directement
    const data = body['data'] as Record<string, unknown> | undefined;
    const emeReference =
      (data?.['reference'] as string | undefined) ??
      (body['reference'] as string | undefined);

    if (!emeReference) {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: 'FAILED',
          error: 'Champ reference manquant dans le webhook Orange Money',
        },
      });
      return;
    }

    const voucher = await this.prisma.voucher.findUnique({
      where: { code: emeReference },
    });

    if (!voucher) {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: 'FAILED',
          error: `Aucun voucher trouvé pour la référence EME : ${emeReference}`,
        },
      });
      return;
    }

    if (voucher.status !== 'PENDING') {
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.voucher.update({
          where: { id: voucher.id },
          data: {
            status: 'ISSUED',
            emeConfirmedAt: new Date(),
          },
        });

        await this.ledger.recordIssue(
          { tx },
          {
            voucherId: voucher.id,
            companyId: voucher.companyId,
            amount: voucher.nominalValue,
          },
        );

        await tx.webhookLog.update({
          where: { id: webhookLogId },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      });

      this.logger.log(`Bon ${voucher.id} activé via webhook Orange Money (ref: ${emeReference})`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erreur activation bon ${voucher.id} via OM : ${errMsg}`);
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'FAILED', error: errMsg },
      }).catch(() => undefined);
    }
  }

  // Enregistre chaque webhook reçu — appelé APRÈS vérification signature
  // Retourne le WebhookLog créé/mis à jour pour permettre le traitement asynchrone
  async logWebhook(dto: {
    provider: WebhookProvider;
    rawBody: string;
    status: 'RECEIVED' | 'FAILED';
    error?: string;
  }): Promise<{ id: string }> {
    // Extrait la référence du corps JSON (best-effort)
    let reference: string;
    let amount: number | undefined;
    try {
      const parsed = JSON.parse(dto.rawBody) as Record<string, unknown>;
      reference =
        (parsed['id'] as string) ??
        (parsed['reference'] as string) ??
        crypto.randomUUID();
      // Wave envoie les montants en FCFA (entier), OM en centimes selon version
      const rawAmount = parsed['amount'] ?? parsed['montant'];
      if (typeof rawAmount === 'number') {
        amount = dto.provider === WebhookProvider.WAVE
          ? rawAmount * 100  // Wave : FCFA → centimes
          : rawAmount;       // OM : déjà en centimes
      }
    } catch {
      reference = crypto.randomUUID();
    }

    return this.prisma.webhookLog.upsert({
      where: { reference },
      update: {
        status: dto.status === 'FAILED' ? 'FAILED' : 'RECEIVED',
        error: dto.error ?? null,
      },
      create: {
        provider: dto.provider,
        reference,
        rawBody: dto.rawBody,
        status: dto.status,
        amount,
        error: dto.error,
      },
      select: { id: true },
    });
  }

  // Marque un webhook échoué comme RECEIVED pour relance manuelle
  async retryWebhook(id: string): Promise<void> {
    await this.prisma.webhookLog.update({
      where: { id },
      data: { status: 'RECEIVED', error: null, processedAt: null },
    });
  }
}
