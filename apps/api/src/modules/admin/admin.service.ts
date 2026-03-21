import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CompanyStatus, MerchantStatus, SaaSPlan } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VouchersService } from '../vouchers/vouchers.service';

export interface OnboardMerchantDto {
  // Commerçant
  merchantName: string;
  merchantPhone: string;
  category: 'GENERAL' | 'FOOD' | 'MOBILITY' | 'HEALTH' | 'RETAIL' | 'EDUCATION';
  address?: string;
  merchantEmail?: string;
  wavePhone?: string;
  omPhone?: string;
  // Utilisateur POS
  posFirstName: string;
  posLastName: string;
  posPhone: string;
}

export interface OnboardCompanyDto {
  // Entreprise
  companyName: string;
  siren?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyAddress?: string;
  plan: 'STANDARD' | 'PREMIUM';
  // Responsable RH
  hrFirstName: string;
  hrLastName: string;
  hrPhone: string;
  hrEmail?: string;
  hrPoste?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly vouchers: VouchersService,
  ) {}

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

  async onboardMerchant(dto: OnboardMerchantDto) {
    // 1. Créer le commerçant
    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.merchantName,
        phone: dto.merchantPhone,
        category: dto.category,
        address: dto.address || null,
        email: dto.merchantEmail || null,
        wavePhone: dto.wavePhone || null,
        omPhone: dto.omPhone || null,
        status: 'PENDING',
      },
    });

    // 2. Créer ou rattacher l'utilisateur POS
    const posUser = await this.prisma.user.upsert({
      where: { phone: dto.posPhone },
      update: { merchantId: merchant.id, firstName: dto.posFirstName, lastName: dto.posLastName, role: 'MERCHANT' },
      create: {
        phone: dto.posPhone,
        firstName: dto.posFirstName,
        lastName: dto.posLastName,
        role: 'MERCHANT',
        merchantId: merchant.id,
      },
    });

    // 3. Envoyer SMS de bienvenue
    await this.notifications.sendMerchantWelcomeSms(dto.posPhone, dto.merchantName, dto.posFirstName);

    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      posUserId: posUser.id,
      posPhone: dto.posPhone,
    };
  }

  async onboardCompany(dto: OnboardCompanyDto) {
    // 1. Créer l'entreprise
    const company = await this.prisma.company.create({
      data: {
        name: dto.companyName,
        siren: dto.siren || null,
        email: dto.companyEmail || null,
        phone: dto.companyPhone || null,
        address: dto.companyAddress || null,
        plan: dto.plan,
        status: 'PENDING_KYB',
        provisionBalance: 0,
      },
    });

    // 2. Créer l'utilisateur RH COMPANY_ADMIN (upsert — le numéro peut déjà exister)
    await this.prisma.user.upsert({
      where: { phone: dto.hrPhone },
      update: {
        role: 'COMPANY_ADMIN',
        companyId: company.id,
        firstName: dto.hrFirstName,
        lastName: dto.hrLastName,
        email: dto.hrEmail || null,
      },
      create: {
        phone: dto.hrPhone,
        firstName: dto.hrFirstName,
        lastName: dto.hrLastName,
        email: dto.hrEmail || null,
        role: 'COMPANY_ADMIN',
        companyId: company.id,
      },
    });

    // 3. Créer l'invitation RH (token UUID, TTL 7 jours)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.invitation.create({
      data: {
        token,
        phone: dto.hrPhone,
        email: dto.hrEmail || null,
        firstName: dto.hrFirstName,
        lastName: dto.hrLastName,
        poste: dto.hrPoste || null,
        companyId: company.id,
        status: 'PENDING',
        expiresAt,
      },
    });

    // 4. Envoyer SMS d'invitation au RH
    await this.notifications.sendInvitationSms(dto.hrPhone, token, dto.hrFirstName);

    return {
      companyId: company.id,
      companyName: company.name,
      hrPhone: dto.hrPhone,
      invitationToken: token,
      expiresAt,
    };
  }

  // ─── Contrats & SaaS ────────────────────────────────────────────────────────

  // Tarifs en centimes FCFA (INSERT ONLY dans le ledger)
  static readonly SAAS_PRICING: Record<SaaSPlan, { monthly: number; label: string }> = {
    STANDARD: { monthly: 1_500_000, label: 'Standard — 15 000 FCFA/mois' },
    PREMIUM:  { monthly: 5_000_000, label: 'Premium — 50 000 FCFA/mois' },
  };
  static readonly DOSSIER_FEE = 1_000_000; // 10 000 FCFA (frais KYB unique)

  async updateCompanyPlan(id: string, plan: SaaSPlan) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Entreprise introuvable');
    return this.prisma.company.update({ where: { id }, data: { plan } });
  }

  async chargeSaasFee(id: string, feeType: 'MONTHLY' | 'DOSSIER') {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Entreprise introuvable');

    const amount = feeType === 'DOSSIER'
      ? AdminService.DOSSIER_FEE
      : AdminService.SAAS_PRICING[company.plan].monthly;

    const feeLabel = feeType === 'DOSSIER'
      ? 'Frais de dossier KYB'
      : `Abonnement ${company.plan} mensuel`;

    if (company.provisionBalance < amount) {
      throw new ConflictException({
        code: 'INSUFFICIENT_PROVISION',
        message: `Provision insuffisante. Requis : ${(amount / 100).toLocaleString('fr-SN')} FCFA. Disponible : ${(company.provisionBalance / 100).toLocaleString('fr-SN')} FCFA.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: { provisionBalance: { decrement: amount } },
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'SAAS_REVENUE',
          debitAccount: `PROVISION_COMPANY:${id}`,
          creditAccount: 'REVENUE_SAAS',
          amount,
          companyId: id,
          reference: crypto.randomUUID(),
          metadata: { feeType, feeLabel, plan: company.plan },
        },
      });

      const updated = await tx.company.findUnique({ where: { id } });
      return {
        success: true,
        feeLabel,
        amountCentimes: amount,
        newProvisionBalance: updated!.provisionBalance,
      };
    });
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

  // ─── Régénération QR codes ──────────────────────────────────────────────────

  async regenerateAllQrCodes(): Promise<{ updated: number; errors: number }> {
    const BATCH_SIZE = 50;
    let updated = 0;
    let errors = 0;
    let skip = 0;

    while (true) {
      const batch = await this.prisma.voucher.findMany({
        where: { status: { in: ['PENDING', 'ISSUED', 'PARTIAL'] } },
        select: { id: true, code: true, companyId: true },
        take: BATCH_SIZE,
        skip,
        orderBy: { createdAt: 'asc' },
      });

      if (batch.length === 0) break;

      for (const voucher of batch) {
        try {
          const { qrData } = this.vouchers.generateQrData(voucher.id, voucher.code, voucher.companyId);
          await this.prisma.voucher.update({
            where: { id: voucher.id },
            data: { qrData },
          });
          updated++;
        } catch {
          errors++;
        }
      }

      skip += BATCH_SIZE;
    }

    return { updated, errors };
  }
}
