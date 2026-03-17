import { Controller, Get, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  findAll() {
    return this.merchantsService.findAll();
  }

  // Dashboard du commerçant connecté — merchantId extrait du JWT
  @Get('me/dashboard')
  myDashboard(@Req() req: Request & { user: JwtPayload }) {
    const merchantId = req.user.merchantId;
    if (!merchantId) throw new ForbiddenException('Compte non commerçant');
    return this.merchantsService.getDashboard(merchantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.merchantsService.findOne(id);
  }
}
