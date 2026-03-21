import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { VoucherExpirationService } from './voucher-expiration.service';
import { LedgerModule } from '../ledger/ledger.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [LedgerModule, LoyaltyModule],
  controllers: [VouchersController],
  providers: [VouchersService, VoucherExpirationService],
  exports: [VouchersService],
})
export class VouchersModule {}
