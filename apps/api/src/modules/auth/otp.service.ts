import * as crypto from 'crypto';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

const OTP_TTL_SECONDS = 5 * 60;         // 5 minutes
const OTP_RATE_LIMIT = 3;               // max 3 envois/heure
const OTP_RATE_WINDOW_SECONDS = 3600;   // 1 heure
const OTP_BLOCK_SECONDS = 30 * 60;      // blocage 30 min après 3 échecs

@Injectable()
export class OtpService {
  private readonly isDev = process.env.APP_ENV === 'development';

  
  private async safeRedis<T>(fn: () => Promise<T>, fallback: T, timeout = 2000): Promise<T> {
    try {
      return await Promise.race([fn(), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), timeout))]);
    } catch { return fallback; }
  }
  constructor(private readonly redis: RedisService) {}

  async send(phone: string): Promise<void> {
    if (!this.isDev) {
      const blockedKey = `otp_blocked:${phone}`;
      const triesKey = `otp_tries:${phone}`;

      const isBlocked = await this.safeRedis(() => this.redis.get(blockedKey), null);
      if (isBlocked) {
        throw new HttpException(
          'Trop de tentatives. Réessayez dans 30 minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const tries = parseInt((await this.safeRedis(() => this.redis.get(triesKey), null)) ?? '0', 10);
      if (tries >= OTP_RATE_LIMIT) {
        throw new HttpException(
          'Trop de codes envoyés. Réessayez dans 1 heure.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.generateCode();
    const otpKey = `otp:${phone}`;
    const triesKey = `otp_tries:${phone}`;

    await Promise.all([
      this.redis.setex(otpKey, OTP_TTL_SECONDS, code),
      ...(!this.isDev ? [this.redis.incrWithExpire(triesKey, OTP_RATE_WINDOW_SECONDS)] : []),
    ]);

    // TODO: envoyer via NotificationsModule (Nexah SMS)
    console.log(`[OTP] ${phone} → ${code}`);
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const otpKey = `otp:${phone}`;

    const stored = await this.safeRedis(() => this.redis.get(otpKey), null);
    if (!stored) {
      return false;
    }

    // timingSafeEqual — protection timing attack
    const valid = crypto.timingSafeEqual
      ? crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(code))
      : stored === code;

    if (!valid) {
      if (!this.isDev) {
        const blockedKey = `otp_blocked:${phone}`;
        const failKey = `otp_fails:${phone}`;

        const fails = await this.redis.incr(failKey);
        if (fails === 1) {
          await this.redis.expire(failKey, OTP_BLOCK_SECONDS);
        }
        if (fails >= OTP_RATE_LIMIT) {
          await this.redis.setex(blockedKey, OTP_BLOCK_SECONDS, '1');
          await this.safeRedis(() => this.redis.del(otpKey), 0);
          throw new HttpException(
            'Compte temporairement bloqué (30 min).',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      return false;
    }

    // Succès — invalider le code
    const cleanupKeys = [otpKey];
    if (!this.isDev) cleanupKeys.push(`otp_fails:${phone}`);
    await Promise.all(cleanupKeys.map((k) => this.redis.del(k)));

    return true;
  }

  private generateCode(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }
}
