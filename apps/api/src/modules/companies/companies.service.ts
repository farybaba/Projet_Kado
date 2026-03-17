import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IsString, IsEmail, IsOptional, IsInt, Min, IsPhoneNumber, MaxLength } from 'class-validator';
import * as crypto from 'crypto';
import * as Papa from 'papaparse';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MerchantCategory } from '@prisma/client';
import type { Company, Voucher } from '@prisma/client';

export class IssueVoucherDto {
  @IsString()
  @IsPhoneNumber('SN')
  beneficiaryPhone!: string;

  @IsInt()
  @Min(100)  // min 1 FCFA en centimes
  nominalValue!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

export class InviteCollaboratorDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  poste?: string;

  @IsOptional()
  @IsString()
  departement?: string;
}

export interface CsvImportResult {
  success: number;
  errors: Array<{ line: number; phone: string; reason: string }>;
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async findOne(id: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Entreprise introuvable');
    return company;
  }

  async issueVoucher(companyId: string, dto: IssueVoucherDto): Promise<Voucher> {
    const company = await this.findOne(companyId);

    if (company.provisionBalance < dto.nominalValue) {
      throw new ConflictException({
        code: 'INSUFFICIENT_PROVISION',
        message: 'Provision insuffisante',
      });
    }

    // Résoudre l'utilisateur bénéficiaire s'il existe déjà en base
    const beneficiaryUser = await this.prisma.user.findUnique({
      where: { phone: dto.beneficiaryPhone },
      select: { id: true },
    });

    const code = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // J+180

    const ts = Date.now();
    const hmacSecret = process.env.HMAC_VOUCHER_SECRET!;
    const innerPayload = JSON.stringify({ code, companyId, ts });
    const qrSignature = crypto
      .createHmac('sha256', hmacSecret)
      .update(innerPayload)
      .digest('hex');
    const qrDataSigned = JSON.stringify({ code, companyId, ts, sig: qrSignature });

    const voucher = await this.prisma.$transaction(async (tx) => {
      // Décrémenter la provision
      await tx.company.update({
        where: { id: companyId },
        data: { provisionBalance: { decrement: dto.nominalValue } },
      });

      const v = await tx.voucher.create({
        data: {
          code,
          qrData: qrDataSigned,
          nominalValue: dto.nominalValue,
          remainingValue: dto.nominalValue,
          status: 'PENDING',
          type: (dto.type as any) ?? 'GIFT_VOUCHER',
          companyId,
          beneficiaryPhone: dto.beneficiaryPhone,
          // Lier au User si le bénéficiaire existe déjà — permet à GET /vouchers/me de le trouver
          ...(beneficiaryUser ? { beneficiaryId: beneficiaryUser.id } : {}),
          expiresAt,
          note: dto.note,
        },
      });

      await this.ledger.recordIssue(
        { tx },
        { voucherId: v.id, companyId, amount: dto.nominalValue },
      );

      return v;
    });

    // Notification SMS asynchrone
    await this.notifications.sendVoucherSms(dto.beneficiaryPhone, voucher);

    return voucher;
  }

  // Import CSV — jusqu'à 500 lignes avec rapport d'erreurs
  async importVouchersFromCsv(
    companyId: string,
    csvContent: string,
  ): Promise<CsvImportResult> {
    const { data } = Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    const result: CsvImportResult = { success: 0, errors: [] };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const phone = row['telephone'] ?? row['phone'] ?? '';
      const amountRaw = row['montant'] ?? row['amount'] ?? '';
      const amount = parseInt(amountRaw, 10) * 100; // FCFA → centimes

      try {
        if (!phone.match(/^\+221[0-9]{9}$/)) {
          throw new Error('Numéro invalide');
        }
        if (isNaN(amount) || amount < 100) {
          throw new Error('Montant invalide');
        }

        await this.issueVoucher(companyId, {
          beneficiaryPhone: phone,
          nominalValue: amount,
          note: row['note'],
        });

        result.success++;
      } catch (err: any) {
        result.errors.push({
          line: i + 2,
          phone,
          reason: err.message ?? 'Erreur inconnue',
        });
      }
    }

    return result;
  }

  async findVouchers(companyId: string, limit = 30): Promise<Voucher[]> {
    await this.findOne(companyId); // vérifie que l'entreprise existe
    return this.prisma.voucher.findMany({
      where: { companyId },
      orderBy: { issuedAt: 'desc' },
      take: limit,
    });
  }

  async inviteCollaborator(companyId: string, dto: InviteCollaboratorDto) {
    await this.findOne(companyId); // lève 404 si l'entreprise n'existe pas

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    const invitation = await this.prisma.invitation.create({
      data: { ...dto, companyId, token, expiresAt },
    });

    if (dto.phone) {
      await this.notifications.sendInvitationSms(dto.phone, token, dto.firstName);
    }

    return invitation;
  }

  async findInvitations(companyId: string) {
    await this.findOne(companyId);

    // Auto-expire les invitations dont le TTL est dépassé
    await this.prisma.invitation.updateMany({
      where: { companyId, status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });

    return this.prisma.invitation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getImpact(companyId: string): Promise<{
    educationAmountCentimes: number;
    uniqueMerchantCount: number;
    uniqueBeneficiaryCount: number;
  }> {
    await this.findOne(companyId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [educationTxs, distinctMerchants, distinctBeneficiaries] = await Promise.all([
      this.prisma.voucherTransaction.findMany({
        where: {
          voucher: { companyId },
          merchant: { category: MerchantCategory.EDUCATION },
          createdAt: { gte: startOfMonth },
        },
        select: { amount: true },
      }),
      this.prisma.voucherTransaction.findMany({
        where: { voucher: { companyId } },
        select: { merchantId: true },
        distinct: ['merchantId'],
      }),
      this.prisma.voucher.findMany({
        where: { companyId },
        select: { beneficiaryPhone: true },
        distinct: ['beneficiaryPhone'],
      }),
    ]);

    return {
      educationAmountCentimes: educationTxs.reduce((sum, tx) => sum + tx.amount, 0),
      uniqueMerchantCount: distinctMerchants.length,
      uniqueBeneficiaryCount: distinctBeneficiaries.length,
    };
  }
}
