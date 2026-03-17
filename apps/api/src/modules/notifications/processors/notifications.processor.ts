import { Processor, Process } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';

interface SmsJob {
  phone: string;
  message: string;
  voucherId?: string;
}

@Processor('notifications')
export class NotificationsProcessor {
  constructor(private readonly config: ConfigService) {}

  @Process('send-sms')
  async handleSms(job: Job<SmsJob>): Promise<void> {
    const { phone, message } = job.data;

    // Nexah SMS — provider principal Sénégal
    try {
      await this.sendViaNexah(phone, message);
    } catch {
      // Fallback Twilio
      await this.sendViaTwilio(phone, message);
    }
  }

  private async sendViaNexah(phone: string, message: string): Promise<void> {
    const apiKey = this.config.get<string>('NEXAH_API_KEY');
    if (!apiKey) throw new Error('NEXAH_API_KEY manquant');

    const res = await fetch('https://api.nexah.net/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: phone,
        message,
        from: this.config.get<string>('SMS_FROM_NUMBER'),
      }),
    });

    if (!res.ok) {
      throw new Error(`Nexah erreur ${res.status}`);
    }
  }

  private async sendViaTwilio(phone: string, message: string): Promise<void> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('SMS_FROM_NUMBER');

    if (!accountSid || !authToken) throw new Error('Twilio non configuré');

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const body = new URLSearchParams({ To: phone, From: from!, Body: message });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      throw new Error(`Twilio erreur ${res.status}`);
    }
  }
}
