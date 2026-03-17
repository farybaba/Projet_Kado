import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LedgerService } from '../../ledger/ledger.service';

interface SettleJob {
  merchantId: string;
  amount: number;       // centimes FCFA
  reference: string;   // SETTLE-{merchantId}-{yyyyMMdd}
}

@Processor('settlements')
export class SettlementProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  @Process('settle-merchant')
  async handleSettlement(job: Job<SettleJob>): Promise<void> {
    const { merchantId, amount, reference } = job.data;

    await this.prisma.$transaction(async (tx) => {
      // Idempotence — vérifier que le reversement n'existe pas encore
      const existing = await tx.merchantSettlement.findUnique({ where: { reference } });
      if (existing) return;

      await tx.merchantSettlement.create({
        data: { merchantId, amount, reference },
      });

      await this.ledger.recordSettlement(merchantId, amount, reference);

      // TODO: déclencher virement Wave/OM via API EME partenaire
    });
  }
}
