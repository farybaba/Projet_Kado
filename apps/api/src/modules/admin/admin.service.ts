import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanyStatus, MerchantStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      activeCompanies,
      activeMerchants,
      monthlyVouchers,
      monthlyTransactions,
      activeBeneficiaries,
    ] = await Promise.all([
      this.prisma.company.count({ where: { status: 'ACTIVE' } }),
      this.prisma.merchant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.voucher.aggregate({
        where: { issuedAt: { gte: startOfMonth } },
        _sum: { nominalValue: true },
        _count: { id: true },
      }),
      this.prisma.voucherTransaction.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { amount: true, commission: true },
        _count: { id: true },
      }),
      this.prisma.user.count({ where: { role: 'BENEFICIARY', isActive: true } }),
    ]);

    return {
      activeCompanies,
      activeMerchants,
      monthlyVolumeIssuedCentimes: monthlyVouchers._sum.nominalValue ?? 0,
      monthlyVouchersCount: monthlyVouchers._count.id,
      monthlyTransactionVolumeCentimes: monthlyTransactions._sum.amount ?? 0,
      monthlyCommissionCentimes: monthlyTransactions._sum.commission ?? 0,
      monthlyTransactionsCount: monthlyTransactions._count.id,
      activeBeneficiaries,
    };
  }

  async getCompanies() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [companies, monthlyStats] = await Promise.all([
      this.prisma.company.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.voucher.groupBy({
        by: ['companyId'],
        where: { issuedAt: { gte: startOfMonth } },
        _count: { id: true },
        _sum: { nominalValue: true },
      }),
    ]);

    const statsMap = new Map(monthlyStats.map((s) => [s.companyId, s]));

    return companies.map((c) => {
      const stats = statsMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        siren: c.siren,
        status: c.status,
        plan: c.plan,
        provisionBalance: c.provisionBalance,
        email: c.email,
        phone: c.phone,
        address: c.address,
        monthlyVouchersCount: stats?._count.id ?? 0,
        monthlyVolumeCentimes: stats?._sum.nominalValue ?? 0,
        createdAt: c.createdAt,
      };
    });
  }

  async getMerchants() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [merchants, monthlyStats] = await Promise.all([
      this.prisma.merchant.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.voucherTransaction.groupBy({
        by: ['merchantId'],
        where: { createdAt: { gte: startOfMonth } },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    const statsMap = new Map(monthlyStats.map((s) => [s.merchantId, s]));

    return merchants.map((m) => {
      const stats = statsMap.get(m.id);
      return {
        id: m.id,
        name: m.name,
        category: m.category,
        status: m.status,
        phone: m.phone,
        address: m.address,
        monthlyTransactionsCount: stats?._count.id ?? 0,
        monthlyVolumeCentimes: stats?._sum.amount ?? 0,
        createdAt: m.createdAt,
      };
    });
  }

  async updateCompanyStatus(id: string, status: CompanyStatus) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Entreprise introuvable');
    return this.prisma.company.update({ where: { id }, data: { status } });
  }

  async updateMerchantStatus(id: string, status: MerchantStatus) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Commerçant introuvable');
    return this.prisma.merchant.update({ where: { id }, data: { status } });
  }

  async getAlerts() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Entreprises avec provision < 10 000 FCFA (1 000 000 centimes)
    const lowProvisionCompanies = await this.prisma.company.findMany({
      where: { status: 'ACTIVE', provisionBalance: { lt: 1_000_000 } },
      select: { id: true, name: true, provisionBalance: true, siren: true },
    });

    // Détection fraude : même bénéficiaire > 3 fois aujourd'hui chez le même commerçant
    const todayTxs = await this.prisma.voucherTransaction.findMany({
      where: { createdAt: { gte: today } },
      select: {
        merchantId: true,
        voucher: { select: { beneficiaryPhone: true } },
      },
    });

    const pairCounts = new Map<string, number>();
    for (const tx of todayTxs) {
      const key = `${tx.merchantId}:${tx.voucher.beneficiaryPhone}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }

    const suspiciousMerchantIds = new Set<string>();
    for (const [key, count] of pairCounts.entries()) {
      if (count > 3) suspiciousMerchantIds.add(key.split(':')[0]);
    }

    const suspiciousMerchants =
      suspiciousMerchantIds.size > 0
        ? await this.prisma.merchant.findMany({
            where: { id: { in: [...suspiciousMerchantIds] } },
            select: { id: true, name: true, category: true, phone: true },
          })
        : [];

    return { lowProvisionCompanies, suspiciousMerchants };
  }

  // ─── Comptabilité ───────────────────────────────────────────────────────────

  async getLedgerStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Agrégats courants (mois en cours)
    const [
      commissionThisMonth,
      saasThisMonth,
      settlementsThisMonth,
      voucherFloat,
      totalProvision,
    ] = await Promise.all([
      // Commissions encaissées (creditAccount = 'REVENUE_COMMISSION')
      this.prisma.ledgerEntry.aggregate({
        where: { creditAccount: 'REVENUE_COMMISSION', createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // SaaS (type SAAS_REVENUE)
      this.prisma.ledgerEntry.aggregate({
        where: { type: 'SAAS_REVENUE', createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // Reversements effectués (type SETTLE)
      this.prisma.ledgerEntry.aggregate({
        where: { type: 'SETTLE', createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // Float VOUCHER_LIABILITY = somme remainingValue des bons ISSUED/PARTIAL
      this.prisma.voucher.aggregate({
        where: { status: { in: ['ISSUED', 'PARTIAL'] } },
        _sum: { remainingValue: true },
      }),
      // Provision totale = somme provisionBalance de toutes les entreprises
      this.prisma.company.aggregate({
        _sum: { provisionBalance: true },
      }),
    ]);

    const commissionCentimes = commissionThisMonth._sum.amount ?? 0;
    const saasCentimes = saasThisMonth._sum.amount ?? 0;
    const settlementsCentimes = settlementsThisMonth._sum.amount ?? 0;
    const netCentimes = commissionCentimes + saasCentimes - settlementsCentimes;

    // Historique 6 derniers mois
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [commissionHistory, saasHistory, settlementHistory] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['createdAt'],
        where: { creditAccount: 'REVENUE_COMMISSION', createdAt: { gte: sixMonthsAgo } },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['createdAt'],
        where: { type: 'SAAS_REVENUE', createdAt: { gte: sixMonthsAgo } },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['createdAt'],
        where: { type: 'SETTLE', createdAt: { gte: sixMonthsAgo } },
        _sum: { amount: true },
      }),
    ]);

    // Agréger par mois (YYYY-MM)
    function groupByMonth(entries: Array<{ createdAt: Date; _sum: { amount: number | null } }>) {
      const map = new Map<string, number>();
      for (const e of entries) {
        const key = `${e.createdAt.getFullYear()}-${String(e.createdAt.getMonth() + 1).padStart(2, '0')}`;
        map.set(key, (map.get(key) ?? 0) + (e._sum.amount ?? 0));
      }
      return map;
    }

    const commMap = groupByMonth(commissionHistory);
    const saasMap = groupByMonth(saasHistory);
    const settleMap = groupByMonth(settlementHistory);

    // Construire le tableau des 6 derniers mois
    const monthlyBreakdown = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const comm = commMap.get(key) ?? 0;
      const saas = saasMap.get(key) ?? 0;
      const settle = settleMap.get(key) ?? 0;
      return {
        month: key,
        commissionCentimes: comm,
        saasCentimes: saas,
        settlementsCentimes: settle,
        netCentimes: comm + saas - settle,
      };
    });

    return {
      current: {
        commissionCentimes,
        saasCentimes,
        settlementsCentimes,
        netCentimes,
        voucherFloatCentimes: voucherFloat._sum.remainingValue ?? 0,
        totalProvisionCentimes: totalProvision._sum.provisionBalance ?? 0,
      },
      monthlyBreakdown,
    };
  }

  async getLedgerCsv(): Promise<string> {
    const entries = await this.prisma.ledgerEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        type: true,
        debitAccount: true,
        creditAccount: true,
        amount: true,
        reference: true,
        companyId: true,
        merchantId: true,
        createdAt: true,
      },
    });

    const header = 'id,type,debitAccount,creditAccount,amountFCFA,reference,companyId,merchantId,createdAt';
    const rows = entries.map((e) =>
      [
        e.id,
        e.type,
        e.debitAccount,
        e.creditAccount,
        (e.amount / 100).toFixed(2),
        e.reference,
        e.companyId ?? '',
        e.merchantId ?? '',
        e.createdAt.toISOString(),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  // ─── Webhooks ────────────────────────────────────────────────────────────────

  async getWebhookLogs(limit = 50) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threshold24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [logs, monthlyCount, pendingOver24h] = await Promise.all([
      this.prisma.webhookLog.findMany({
        orderBy: { receivedAt: 'desc' },
        take: limit,
        include: {
          merchant: { select: { name: true } },
        },
      }),
      this.prisma.webhookLog.count({
        where: { status: 'PROCESSED', receivedAt: { gte: startOfMonth } },
      }),
      this.prisma.webhookLog.count({
        where: { status: 'RECEIVED', receivedAt: { lt: threshold24h } },
      }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        provider: l.provider,
        reference: l.reference,
        status: l.status,
        amount: l.amount,
        merchantName: l.merchant?.name ?? null,
        receivedAt: l.receivedAt,
        processedAt: l.processedAt,
        error: l.error,
      })),
      monthlyProcessedCount: monthlyCount,
      pendingOver24hCount: pendingOver24h,
    };
  }

  async retryWebhook(id: string) {
    return this.prisma.webhookLog.update({
      where: { id },
      data: { status: 'RECEIVED', error: null, processedAt: null },
    });
  }

  async getRecentTransactions(limit = 20) {
    const txs = await this.prisma.voucherTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        merchant: { select: { name: true, category: true } },
        voucher: {
          select: {
            beneficiaryPhone: true,
            company: { select: { name: true } },
          },
        },
      },
    });

    return txs.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      commission: tx.commission,
      netAmount: tx.netAmount,
      merchantName: tx.merchant.name,
      merchantCategory: tx.merchant.category,
      companyName: tx.voucher.company.name,
      beneficiaryMasked: tx.voucher.beneficiaryPhone.slice(0, 7) + '***',
      createdAt: tx.createdAt,
    }));
  }
}
