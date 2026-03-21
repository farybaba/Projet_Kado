import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ExpirationReminderService {
  private readonly logger = new Logger(ExpirationReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly queue: Queue,
  ) {}

  /** J-7 : rappel à 08h00 UTC */
  @Cron('0 8 * * *')
  async sendSevenDayReminders(): Promise<void> {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() + 6);
    const to = new Date(now);
    to.setDate(to.getDate() + 7);

    const vouchers = await this.prisma.voucher.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIAL'] },
        expiresAt: { gte: from, lte: to },
      },
    });

    this.logger.log(`[ExpirationReminder] J-7 : ${vouchers.length} bon(s) trouvé(s)`);

    for (const voucher of vouchers) {
      const phone = await this.resolvePhone(voucher.beneficiaryId ?? null, voucher.beneficiaryPhone);
      if (!phone) continue;

      const montant = (voucher.remainingValue / 100).toLocaleString('fr-SN');
      const dateExpiration = voucher.expiresAt.toLocaleDateString('fr-SN');
      const message =
        `Votre bon Kado de ${montant} FCFA expire dans 7 jours (le ${dateExpiration}). ` +
        `Utilisez-le avant qu'il ne soit trop tard !`;

      await this.enqueueReminder(phone, message, voucher.id);
    }
  }

  /** J-1 : rappel à 08h00 UTC */
  @Cron('0 8 * * *')
  async sendOneDayReminders(): Promise<void> {
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);
    to.setDate(to.getDate() + 1);

    const vouchers = await this.prisma.voucher.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIAL'] },
        expiresAt: { gte: from, lte: to },
      },
    });

    this.logger.log(`[ExpirationReminder] J-1 : ${vouchers.length} bon(s) trouvé(s)`);

    for (const voucher of vouchers) {
      const phone = await this.resolvePhone(voucher.beneficiaryId ?? null, voucher.beneficiaryPhone);
      if (!phone) continue;

      const montant = (voucher.remainingValue / 100).toLocaleString('fr-SN');
      const message =
        `URGENT : Votre bon Kado de ${montant} FCFA expire demain ! ` +
        `Rendez-vous chez un commerçant Kado aujourd'hui.`;

      await this.enqueueReminder(phone, message, voucher.id);
    }
  }

  private async resolvePhone(beneficiaryId: string | null, beneficiaryPhone: string): Promise<string | null> {
    if (beneficiaryPhone) return beneficiaryPhone;
    if (!beneficiaryId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: beneficiaryId },
      select: { phone: true },
    });
    return user?.phone ?? null;
  }

  private async enqueueReminder(phone: string, message: string, voucherId: string): Promise<void> {
    try {
      await this.queue.add(
        'send-sms',
        { phone, message, voucherId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
        },
      );
    } catch (err) {
      this.logger.error(`[ExpirationReminder] Échec enqueue SMS pour voucher ${voucherId}:`, err);
    }
  }
}
