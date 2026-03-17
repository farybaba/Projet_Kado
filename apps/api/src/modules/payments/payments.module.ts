import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SettlementProcessor } from './processors/settlement.processor';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'settlements' }),
    BullModule.registerQueue({ name: 'eme-instructions' }),
    LedgerModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, SettlementProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
