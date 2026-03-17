import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { IsString, IsInt, Min, Max } from 'class-validator';
import { VouchersService } from './vouchers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/auth.service';

class LookupVoucherDto {
  @IsString()
  code!: string;

  @IsString()
  qrSignature!: string;
}

class ValidateVoucherDto {
  @IsString()
  code!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000_00) // 10M FCFA max en centimes
  amountCentimes!: number;

  @IsString()
  merchantId!: string;

  @IsString()
  qrSignature!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('me')
  async myVouchers(@Req() req: Request & { user: JwtPayload }) {
    return this.vouchersService.findByBeneficiary(req.user.sub, req.user.phone);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.vouchersService.findOne(id);
  }

  @Get(':id/transactions')
  async transactions(@Param('id') id: string) {
    return this.vouchersService.findTransactions(id);
  }

  // Lecture sans débit — appelé par le POS après scan QR pour afficher le preview
  @Post('lookup')
  async lookup(@Body() dto: LookupVoucherDto) {
    return this.vouchersService.lookupByCode(dto.code, dto.qrSignature);
  }

  @Post('validate')
  async validate(@Body() dto: ValidateVoucherDto) {
    return this.vouchersService.validate(
      dto.code,
      dto.amountCentimes,
      dto.merchantId,
      dto.qrSignature,
    );
  }
}
