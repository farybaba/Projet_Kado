import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FlashOffersService, CreateFlashOfferDto } from './flash-offers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface JwtUser {
  sub: string;
  role: string;
  merchantId?: string;
}

@Controller('flash-offers')
export class FlashOffersController {
  constructor(private readonly service: FlashOffersService) {}

  // Public — bénéficiaires voient les offres actives
  @Get()
  getActive(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.service.getActive(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
  }

  // Commerçant — ses propres offres
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMy(@Req() req: { user: JwtUser }) {
    return this.service.getByMerchant(req.user.merchantId!);
  }

  // Commerçant — créer une offre
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: { user: JwtUser }, @Body() dto: CreateFlashOfferDto) {
    return this.service.create(req.user.merchantId!, dto);
  }

  // Commerçant — activer/désactiver
  @UseGuards(JwtAuthGuard)
  @Patch(':id/toggle')
  toggle(@Req() req: { user: JwtUser }, @Param('id') id: string) {
    return this.service.toggle(req.user.merchantId!, id);
  }
}
