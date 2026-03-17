import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OtpService } from './otp.service';

export interface JwtPayload {
  sub: string;
  role: string;
  phone?: string;
  companyId?: string;
  merchantId?: string;  // ajouté pour les marchands POS
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly otpService: OtpService,
  ) {}

  async sendOtp(phone: string): Promise<void> {
    await this.otpService.send(phone);
  }

  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; role: string; merchantId?: string }> {
    const valid = await this.otpService.verify(phone, code);
    if (!valid) {
      throw new UnauthorizedException('OTP invalide ou expiré');
    }

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: 'BENEFICIARY' },
      });
    }

    const tokens = await this.generateTokenPair(
      user.id,
      user.role,
      user.phone ?? undefined,
      user.companyId ?? undefined,
      user.merchantId ?? undefined,
    );

    return {
      ...tokens,
      role: user.role,
      merchantId: user.merchantId ?? undefined,
    };
  }

  async refreshTokens(
    _userId: string,
    family: string,
    rawToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.updateMany({
        where: { family },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException('Token de rafraîchissement invalide');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { user } = stored;
    return this.generateTokenPair(
      user.id,
      user.role,
      user.phone ?? undefined,
      user.companyId ?? undefined,
      user.merchantId ?? undefined,
      family,
    );
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokenPair(
    userId: string,
    role: string,
    phone?: string,
    companyId?: string,
    merchantId?: string,
    existingFamily?: string,
  ) {
    const payload: JwtPayload = { sub: userId, role, phone, companyId, merchantId };
    const accessToken = this.jwtService.sign(payload);

    const family = existingFamily ?? crypto.randomUUID();
    const rawRefreshToken = crypto.randomUUID();
    const tokenHash = this.hashToken(rawRefreshToken);

    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, family, expiresAt },
    });

    return { accessToken, refreshToken: `${family}.${rawRefreshToken}` };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDuration(duration: string): number {
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1), 10);
    const units: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * (units[unit] ?? 1_000);
  }
}
