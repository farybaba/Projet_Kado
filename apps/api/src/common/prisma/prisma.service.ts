import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: PrismaClient;

  constructor() {
    const url = process.env.DATABASE_URL;
    console.log('[Prisma] DATABASE_URL:', url ? 'FOUND' : 'NOT FOUND');
    this.client = new PrismaClient({
      datasources: url ? { db: { url } } : undefined,
      log: process.env.APP_ENV === 'development' ? ['query', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  get $transaction() { return this.client.$transaction.bind(this.client); }
  get $queryRaw() { return this.client.$queryRaw.bind(this.client); }
  get $executeRaw() { return this.client.$executeRaw.bind(this.client); }

  get user() { return this.client.user; }
  get company() { return this.client.company; }
  get merchant() { return this.client.merchant; }
  get voucher() { return this.client.voucher; }
  get voucherTransaction() { return this.client.voucherTransaction; }
  get ledgerEntry() { return this.client.ledgerEntry; }
  get refreshToken() { return this.client.refreshToken; }
  get invitation() { return this.client.invitation; }
  get merchantSettlement() { return this.client.merchantSettlement; }
  get otpAttempt() { return this.client.otpAttempt; }
  get webhookLog() { return this.client.webhookLog; }
}
