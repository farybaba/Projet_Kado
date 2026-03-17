import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { DevService } from './dev.service';

/**
 * Endpoints de développement — disponibles uniquement si APP_ENV=development.
 * Ce contrôleur N'EST PAS enregistré en production (voir DevModule + AppModule).
 */
@Controller('dev')
export class DevController {
  constructor(private readonly devService: DevService) {}

  /**
   * POST /api/v1/dev/confirm-vouchers
   * Simule la confirmation EME : passe tous les bons PENDING en ISSUED
   * en renseignant emeConfirmedAt = now().
   */
  @Post('confirm-vouchers')
  @HttpCode(HttpStatus.OK)
  confirmVouchers() {
    return this.devService.confirmAllPendingVouchers();
  }
}
