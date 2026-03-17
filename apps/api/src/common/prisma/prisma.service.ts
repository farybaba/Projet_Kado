import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.APP_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    // Ensure env vars are loaded
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
