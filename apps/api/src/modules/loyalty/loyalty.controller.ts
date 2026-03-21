import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService) {}

  @Get('me')
  getMyCards(@Req() req: { user: { sub: string } }) {
    return this.service.getCards(req.user.sub);
  }
}
