import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '@prisma/client';

// Invariant absolu : SUM(débit) = SUM(crédit) pour chaque écriture

interface RedeemParams {
  voucherId: string;
  merchantId: string;
  companyId: string;
  amount: number;       // centimes FCFA
  commission: number;   // centimes FCFA
  netAmount: number;    // centimes FCFA
  reference: string;
}

interface IssueParams {
  voucherId: string;
  companyId: string;
  amount: number;       // centimes FCFA
}

interface TxContext {
  tx: Prisma.TransactionClient;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // Émission : PROVISION_COMPANY:{cId} → VOUCHER_LIABILITY:{vId}
  async recordIssue(
    { tx }: TxContext,
    { voucherId, companyId, amount }: IssueParams,
  ): Promise<void> {
    this.assertPositive(amount);

    const client = tx ?? this.prisma;
    await (client as Prisma.TransactionClient).ledgerEntry.create({
      data: {
        type: 'ISSUE',
        debitAccount: `PROVISION_COMPANY:${companyId}`,
        creditAccount: `VOUCHER_LIABILITY:${voucherId}`,
        amount,
        voucherId,
        companyId,
        reference: crypto.randomUUID(),
      },
    });
  }

  // Validation QR : VOUCHER_LIABILITY:{vId} → MERCHANT_PAYABLE:{mId} (net) + REVENUE_COMMISSION (2%)
  async recordRedeem(
    { tx }: TxContext,
    { voucherId, merchantId, companyId, amount, commission, netAmount, reference }: RedeemParams,
  ): Promise<void> {
    this.assertPositive(amount);
    this.assertBalanced(amount, netAmount + commission);

    const client = tx ?? this.prisma;

    // Écriture 1 : versement net au commerçant
    await (client as Prisma.TransactionClient).ledgerEntry.create({
      data: {
        type: 'REDEEM',
        debitAccount: `VOUCHER_LIABILITY:${voucherId}`,
        creditAccount: `MERCHANT_PAYABLE:${merchantId}`,
        amount: netAmount,
        voucherId,
        merchantId,
        companyId,
        reference: `${reference}-net`,
      },
    });

    // Écriture 2 : commission Kado
    await (client as Prisma.TransactionClient).ledgerEntry.create({
      data: {
        type: 'REDEEM',
        debitAccount: `VOUCHER_LIABILITY:${voucherId}`,
        creditAccount: 'REVENUE_COMMISSION',
        amount: commission,
        voucherId,
        merchantId,
        companyId,
        reference: `${reference}-commission`,
      },
    });
  }

  // Expiration : VOUCHER_LIABILITY:{vId} → EXPIRED_FORFEIT
  async recordExpiry(voucherId: string, companyId: string, amount: number): Promise<void> {
    this.assertPositive(amount);

    await this.prisma.ledgerEntry.create({
      data: {
        type: 'EXPIRE',
        debitAccount: `VOUCHER_LIABILITY:${voucherId}`,
        creditAccount: 'EXPIRED_FORFEIT',
        amount,
        voucherId,
        companyId,
        reference: crypto.randomUUID(),
      },
    });
  }

  // Annulation : VOUCHER_LIABILITY:{vId} → PROVISION_COMPANY:{cId}
  async recordCancellation(voucherId: string, companyId: string, amount: number): Promise<void> {
    this.assertPositive(amount);

    await this.prisma.ledgerEntry.create({
      data: {
        type: 'CANCEL',
        debitAccount: `VOUCHER_LIABILITY:${voucherId}`,
        creditAccount: `PROVISION_COMPANY:${companyId}`,
        amount,
        voucherId,
        companyId,
        reference: crypto.randomUUID(),
      },
    });
  }

  // Reversement : MERCHANT_PAYABLE:{mId} → MERCHANT_SETTLED:{mId}
  async recordSettlement(merchantId: string, amount: number, reference: string): Promise<void> {
    this.assertPositive(amount);

    await this.prisma.ledgerEntry.create({
      data: {
        type: 'SETTLE',
        debitAccount: `MERCHANT_PAYABLE:${merchantId}`,
        creditAccount: `MERCHANT_SETTLED:${merchantId}`,
        amount,
        merchantId,
        reference,
      },
    });
  }

  private assertPositive(amount: number): void {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new Error(`Montant invalide : ${amount}. Doit être un entier positif en centimes FCFA.`);
    }
  }

  private assertBalanced(total: number, sum: number): void {
    if (total !== sum) {
      throw new Error(
        `Invariant ledger violé : débit=${total} ≠ crédit=${sum}. SUM(débit) doit égaler SUM(crédit).`,
      );
    }
  }
}
