import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Merchant } from '@prisma/client';

export interface MerchantDashboard {
  today: {
    gross: number;       // centimes — total validé brut
    commission: number;  // centimes — commission Kado 2%
    net: number;         // centimes — à recevoir T+1
    count: number;
  };
  transactions: Array<{
    id: string;
    beneficiaryMasked: string;  // "Mou***" ou "+22177***"
    amount: number;             // centimes
    createdAt: Date;
  }>;
  settlements: Array<{
    id: string;
    amount: number;
    settledAt: Date;
    waveRef: string | null;
    omRef: string | null;
  }>;
}

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Merchant[]> {
    return this.prisma.merchant.findMany({ where: { isActive: true } });
  }

  async findOne(id: string): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Commerçant introuvable');
    return merchant;
  }

  async create(data: Partial<Merchant>): Promise<Merchant> {
    return this.prisma.merchant.create({ data: data as any });
  }

  async update(id: string, data: Partial<Merchant>): Promise<Merchant> {
    return this.prisma.merchant.update({ where: { id }, data: data as any });
  }

  async getDashboard(merchantId: string): Promise<MerchantDashboard> {
    await this.findOne(merchantId); // lève 404 si inconnu

    // Début de la journée en UTC (Africa/Dakar = UTC+0, pas de décalage)
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [txRows, settlements] = await Promise.all([
      this.prisma.voucherTransaction.findMany({
        where: { merchantId, createdAt: { gte: startOfToday } },
        include: {
          voucher: {
            include: { beneficiary: { select: { firstName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantSettlement.findMany({
        where: { merchantId },
        orderBy: { settledAt: 'desc' },
        take: 10,
      }),
    ]);

    const today = txRows.reduce(
      (acc, tx) => ({
        gross: acc.gross + tx.amount,
        commission: acc.commission + tx.commission,
        net: acc.net + tx.netAmount,
        count: acc.count + 1,
      }),
      { gross: 0, commission: 0, net: 0, count: 0 },
    );

    const transactions = txRows.map((tx) => {
      const firstName = tx.voucher.beneficiary?.firstName;
      const phone = tx.voucher.beneficiaryPhone;
      const beneficiaryMasked = firstName
        ? firstName.slice(0, 3) + '***'
        : phone.slice(0, 7) + '***';

      return {
        id: tx.id,
        beneficiaryMasked,
        amount: tx.amount,
        createdAt: tx.createdAt,
      };
    });

    return { today, transactions, settlements };
  }
}
