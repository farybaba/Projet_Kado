import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DevModule } from './modules/dev/dev.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { AdminModule } from './modules/admin/admin.module';

const isDev = process.env.APP_ENV === 'development';

@Module({
  imports: [
    // Config — charge .env automatiquement
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    // Rate limiting global : 100 req/min par IP
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        throttlers: [
          {
            name: 'global',
            ttl: 60_000,
            limit: 100,
          },
        ],
      }),
    }),

    // Bull — config Redis globale parsée depuis REDIS_URL
    // Bull ne lit pas le mot de passe depuis l'URL, il faut passer host/port/password séparément
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
        return {
          redis: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            username: url.username || undefined,
          },
        };
      },
    }),

    // Cron jobs (reversements T+1, expiration bons)
    ScheduleModule.forRoot(),

    PrismaModule,
    AuthModule,
    UsersModule,
    VouchersModule,
    LedgerModule,
    PaymentsModule,
    MerchantsModule,
    CompaniesModule,
    NotificationsModule,
    InvitationsModule,
    AdminModule,
    // DevModule enregistré uniquement en développement — jamais en production
    ...(isDev ? [DevModule] : []),
  ],
  providers: [
    // Throttler global activé sur tous les contrôleurs
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
