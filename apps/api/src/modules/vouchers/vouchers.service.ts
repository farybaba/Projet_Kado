import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import type { Voucher, VoucherStatus } from '@prisma/client';

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService,
    @Optional() private readonly loyalty: LoyaltyService,
  ) {}

  async findByBeneficiary(userId: string, phone?: string): Promise<Voucher[]> {
    // Les bons peuvent être liés soit par beneficiaryId (UUID), soit par
    // beneficiaryPhone uniquement (bons émis depuis le dashboard sans résolution préalable).
    // On filtre sur les deux pour ne manquer aucun bon.
    const orConditions: object[] = [{ beneficiaryId: userId }];
    if (phone) orConditions.push({ beneficiaryPhone: phone });

    return this.prisma.voucher.findMany({
      where: { OR: orConditions },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Voucher> {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw new NotFoundException('Bon introuvable');
    return voucher;
  }

  async findTransactions(voucherId: string): Promise<Array<{
    id: string;
    merchantName: string;
    amount: number;
    remainingValueAfter: number;
    createdAt: Date;
  }>> {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      select: { nominalValue: true },
    });
    if (!voucher) throw new NotFoundException('Bon introuvable');

    const rows = await this.prisma.voucherTransaction.findMany({
      where: { voucherId },
      orderBy: { createdAt: 'asc' },
      include: { merchant: { select: { name: true } } },
    });

    // Calcul du solde restant après chaque opération en partant de nominalValue
    let running = voucher.nominalValue;
    return rows.map((tx) => {
      running -= tx.amount;
      return {
        id: tx.id,
        merchantName: tx.merchant.name,
        amount: tx.amount,
        remainingValueAfter: running,
        createdAt: tx.createdAt,
      };
    });
  }

  // ─── Validation QR — transaction atomique SELECT FOR UPDATE ──────────────

  async validate(
    rawQrData: string,
    amountCentimes: number,
    merchantId: string,
  ): Promise<{ success: boolean; remainingValue: number }> {
    // DEBUG — à supprimer après diagnostic
    console.log('[VALIDATE DEBUG] rawQrData type:', typeof rawQrData, 'length:', rawQrData?.length ?? 'N/A');
    console.log('[VALIDATE DEBUG] rawQrData start:', String(rawQrData).slice(0, 80));
    console.log('[VALIDATE DEBUG] amountCentimes:', amountCentimes, 'merchantId:', merchantId?.slice(0, 8));

    // Extraire code et signature depuis le contenu brut du QR
    const { code: voucherCode, sig: qrSignature } = this.parseQrContent(rawQrData);
    const transactionResult = await this.prisma.$transaction(
      async (tx) => {
        // SELECT FOR UPDATE — verrouille la ligne, zéro race condition
        const rows = await tx.$queryRaw<Voucher[]>`
          SELECT * FROM "vouchers" WHERE code = ${voucherCode} FOR UPDATE
        `;

        if (!rows.length) {
          throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND', message: 'Bon introuvable' });
        }

        const voucher = rows[0];

        // 1. Vérification signature HMAC-SHA256 sur le contenu brut du QR
        this.verifyQrSignature(rawQrData, qrSignature);

        // 2. Statut ISSUED ou PARTIAL
        if (voucher.status !== 'ISSUED' && voucher.status !== 'PARTIAL') {
          throw new ConflictException({
            code: voucher.status === 'USED' ? 'VOUCHER_ALREADY_USED' : 'VOUCHER_EXPIRED',
            message: 'Bon non utilisable',
          });
        }

        // 3. Expiration
        if (voucher.expiresAt < new Date()) {
          throw new ConflictException({ code: 'VOUCHER_EXPIRED', message: 'Bon expiré' });
        }

        // 4. Solde suffisant
        if (voucher.remainingValue < amountCentimes) {
          throw new ConflictException({
            code: 'INSUFFICIENT_BALANCE',
            message: 'Solde insuffisant',
          });
        }

        // 5. Calcul commission (2%) — Math.round, jamais float
        const commissionRate = this.config.get<number>('COMMISSION_RATE', 0.02);
        const commission = Math.round(amountCentimes * commissionRate);
        const netAmount = amountCentimes - commission;

        // 6. Mise à jour du bon
        const newRemaining = voucher.remainingValue - amountCentimes;
        const newStatus: VoucherStatus = newRemaining === 0 ? 'USED' : 'PARTIAL';

        await tx.voucher.update({
          where: { id: voucher.id },
          data: {
            remainingValue: newRemaining,
            status: newStatus,
            lastUsedAt: new Date(),
          },
        });

        // 7. Transaction
        const ref = crypto.randomUUID();
        await tx.voucherTransaction.create({
          data: {
            voucherId: voucher.id,
            merchantId,
            amount: amountCentimes,
            commission,
            netAmount,
            reference: ref,
          },
        });

        // 8. Entrées ledger dans la même transaction
        await this.ledger.recordRedeem(
          { tx },
          {
            voucherId: voucher.id,
            merchantId,
            companyId: voucher.companyId,
            amount: amountCentimes,
            commission,
            netAmount,
            reference: ref,
          },
        );

        return { success: true, remainingValue: newRemaining, beneficiaryId: voucher.beneficiaryId };
      },
      { timeout: 5_000 },
    );

    // Créditer les points de fidélité hors transaction — échec non bloquant
    if (this.loyalty && transactionResult.beneficiaryId) {
      this.loyalty
        .creditPoints(transactionResult.beneficiaryId, merchantId, amountCentimes)
        .catch(() => {
          // Echec silencieux — la validation reste valide
        });
    }

    return { success: transactionResult.success, remainingValue: transactionResult.remainingValue };
  }

  // ─── Lookup sans débit — pour l'écran de preview POS ──────────────────────
  // Vérifie la signature HMAC et retourne les infos du bon sans modifier quoi que ce soit.
  async lookupByCode(rawQrData: string): Promise<{
    code: string;
    remainingValue: number;
    nominalValue: number;
    type: string;
    expiresAt: Date;
    beneficiaryFirstName: string | null;
  }> {
    const { code, sig: qrSignature } = this.parseQrContent(rawQrData);
    // Vérification HMAC directement sur le contenu brut du QR scanné
    this.verifyQrSignature(rawQrData, qrSignature);

    const voucher = await this.prisma.voucher.findUnique({
      where: { code },
      include: { beneficiary: { select: { firstName: true } } },
    });

    if (!voucher) {
      throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND', message: 'Bon introuvable' });
    }

    if (voucher.status !== 'ISSUED' && voucher.status !== 'PARTIAL') {
      const errorCode = voucher.status === 'USED' ? 'VOUCHER_ALREADY_USED' : 'VOUCHER_EXPIRED';
      throw new ConflictException({ code: errorCode, message: 'Bon non utilisable' });
    }

    if (voucher.expiresAt < new Date()) {
      throw new ConflictException({ code: 'VOUCHER_EXPIRED', message: 'Bon expiré' });
    }

    return {
      code: voucher.code,
      remainingValue: voucher.remainingValue,
      nominalValue: voucher.nominalValue,
      type: voucher.type,
      expiresAt: voucher.expiresAt,
      beneficiaryFirstName: voucher.beneficiary?.firstName ?? null,
    };
  }

  // Parse le contenu brut du QR et retourne code + sig
  private parseQrContent(rawQrData: string): { code: string; sig: string } {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawQrData);
    } catch {
      throw new BadRequestException({ code: 'QR_INVALID', message: 'QR code illisible' });
    }
    const code = parsed['code'] as string | undefined;
    const sig = parsed['sig'] as string | undefined;
    if (!code || !sig) {
      throw new BadRequestException({ code: 'QR_INVALID', message: 'QR code invalide' });
    }
    return { code, sig };
  }

  // Vérifie la signature HMAC du contenu brut du QR scanné
  // rawQrData = la chaîne JSON exacte lue par le scanner — pas le champ DB
  private verifyQrSignature(rawQrData: string, signature: string): void {
    const secret = this.config.get<string>('HMAC_VOUCHER_SECRET');
    if (!secret) throw new Error('HMAC_VOUCHER_SECRET manquant');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawQrData);
    } catch {
      throw new BadRequestException({ code: 'QR_INVALID', message: 'Signature QR incorrecte' });
    }

    // Retirer sig du payload, signer le reste
    const { sig: _stored, ...payloadFields } = parsed;
    const innerPayload = JSON.stringify(payloadFields);

    const expected = crypto
      .createHmac('sha256', secret)
      .update(innerPayload)
      .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);

    const match = expectedBuf.length === receivedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, receivedBuf);

    // DEBUG temporaire — à supprimer après diagnostic
    console.log('[QR DEBUG] secret_prefix:', secret.slice(0, 8));
    console.log('[QR DEBUG] innerPayload:', innerPayload.slice(0, 80));
    console.log('[QR DEBUG] expected:', expected.slice(0, 16), '...');
    console.log('[QR DEBUG] received:', signature.slice(0, 16), '...');
    console.log('[QR DEBUG] match:', match);

    if (!match) {
      throw new BadRequestException({ code: 'QR_INVALID', message: 'Signature QR incorrecte' });
    }
  }

  generateQrData(voucherId: string, code: string, companyId: string): { qrData: string; signature: string } {
    const secret = this.config.get<string>('HMAC_VOUCHER_SECRET');
    if (!secret) throw new Error('HMAC_VOUCHER_SECRET manquant');

    const ts = Date.now();
    const innerPayload = JSON.stringify({ voucherId, code, companyId, ts });
    const signature = crypto
      .createHmac('sha256', secret)
      .update(innerPayload)
      .digest('hex');

    const qrData = JSON.stringify({ voucherId, code, companyId, ts, sig: signature });
    return { qrData, signature };
  }
}
