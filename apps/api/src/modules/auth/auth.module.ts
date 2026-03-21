import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OtpService } from './otp.service';
import { RedisModule } from '../../common/redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const decodeKey = (key: string | undefined): string | undefined => {
          if (!key) return undefined;
          // Essai base64 en premier, sinon \n littéraux, sinon valeur brute
          try {
            const decoded = Buffer.from(key, 'base64').toString('utf8');
            if (decoded.includes('BEGIN')) return decoded;
          } catch {}
          return key.replace(/\\n/g, '\n');
        };
        return {
          privateKey: decodeKey(config.get<string>('JWT_PRIVATE_KEY')),
          publicKey: decodeKey(config.get<string>('JWT_PUBLIC_KEY')),
          signOptions: {
            algorithm: 'RS256',
            expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
          },
        };
      },
    }),
    RedisModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
