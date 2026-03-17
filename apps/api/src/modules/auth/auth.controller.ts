import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';

class SendOtpDto {
  @IsString()
  @Matches(/^\+221[0-9]{9}$/, { message: 'Numéro sénégalais E.164 requis (+221XXXXXXXXX)' })
  phone!: string;
}

class VerifyOtpDto {
  @IsString()
  @Matches(/^\+221[0-9]{9}$/)
  phone!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Code OTP à 6 chiffres requis' })
  code!: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 30 req/min sur /auth/otp (surcharge la règle globale)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('otp/send')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendOtp(@Body() dto: SendOtpDto) {
    await this.authService.sendOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.code);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    const [family, token] = dto.refreshToken.split('.');
    return this.authService.refreshTokens('', family, token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request & { user: { sub: string } }) {
    await this.authService.logout(req.user.sub);
  }
}
