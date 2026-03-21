import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { WebhookProvider } from '@prisma/client';
import type { Request } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhooks/wave')
  @HttpCode(HttpStatus.OK)
  async waveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-wave-signature') signature: string,
  ) {
    const rawBody = req.rawBody!;
    const rawBodyStr = rawBody.toString();

    try {
      // Vérification HMAC AVANT tout parsing JSON
      this.paymentsService.verifyWaveWebhook(rawBody, signature);

      // Parsing sécurisé du body — la signature est déjà vérifiée
      const body = JSON.parse(rawBodyStr) as Record<string, unknown>;

      const webhookLog = await this.paymentsService.logWebhook({
        provider: WebhookProvider.WAVE,
        rawBody: rawBodyStr,
        status: 'RECEIVED',
      });

      // Traitement asynchrone non-bloquant — on retourne { received: true } immédiatement
      this.paymentsService
        .processWaveWebhook(webhookLog.id, body)
        .catch(() => undefined);

      return { received: true };
    } catch (err: unknown) {
      await this.paymentsService.logWebhook({
        provider: WebhookProvider.WAVE,
        rawBody: rawBodyStr,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  @Post('webhooks/orange-money')
  @HttpCode(HttpStatus.OK)
  async omWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-om-signature') signature: string,
  ) {
    const rawBody = req.rawBody!;
    const rawBodyStr = rawBody.toString();

    try {
      this.paymentsService.verifyOmWebhook(rawBody, signature);

      const body = JSON.parse(rawBodyStr) as Record<string, unknown>;

      const webhookLog = await this.paymentsService.logWebhook({
        provider: WebhookProvider.ORANGE_MONEY,
        rawBody: rawBodyStr,
        status: 'RECEIVED',
      });

      // Traitement asynchrone non-bloquant
      this.paymentsService
        .processOrangeMoneyWebhook(webhookLog.id, body)
        .catch(() => undefined);

      return { received: true };
    } catch (err: unknown) {
      await this.paymentsService.logWebhook({
        provider: WebhookProvider.ORANGE_MONEY,
        rawBody: rawBodyStr,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
