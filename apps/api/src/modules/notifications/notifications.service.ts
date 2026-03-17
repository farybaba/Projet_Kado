import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { Voucher } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('notifications') private readonly queue: Queue,
  ) {}

  async sendVoucherSms(phone: string, voucher: Voucher): Promise<void> {
    const montant = voucher.nominalValue / 100;
    const message =
      `Votre bon Kado de ${montant.toLocaleString('fr-SN')} FCFA est disponible. ` +
      `Code : ${voucher.code.slice(0, 8).toUpperCase()}. ` +
      `Valable jusqu'au ${voucher.expiresAt.toLocaleDateString('fr-SN')}.`;

    await this.queue.add(
      'send-sms',
      { phone, message, voucherId: voucher.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
      },
    );
  }

  async sendOtpSms(phone: string, code: string): Promise<void> {
    const message = `Votre code Kado : ${code}. Valable 5 minutes. Ne le partagez jamais.`;

    await this.queue.add(
      'send-sms',
      { phone, message },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
      },
    );
  }

  async sendInvitationSms(phone: string, token: string, firstName?: string): Promise<void> {
    const isDev = process.env.APP_ENV === 'development';
    const link = `https://kado.sn/join/${token}`;
    const name = firstName ? ` ${firstName}` : '';
    const message =
      `Bonjour${name}, votre RH vous invite à rejoindre Kado. ` +
      `Activez votre compte ici : ${link}`;

    if (isDev) {
      console.log(
        `\n[DEV] ✉️  SMS Invitation\n  Destinataire : ${phone}\n  Lien         : ${link}\n`,
      );
      return;
    }

    await this.queue.add(
      'send-sms',
      { phone, message },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
      },
    );
  }
}
