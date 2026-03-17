import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Queue } from 'bull';
import { WebhookProvider } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  // Enregistre chaque webhook reçu — appelé APRÈS vérification signature
  async logWebhook(dto: {
    provider: WebhookProvider;
    rawBody: string;
    status: 'RECEIVED' | 'FAILED';
    error?: string;
  }): Promise<void> {
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

    await this.prisma.webhookLog.upsert({
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
