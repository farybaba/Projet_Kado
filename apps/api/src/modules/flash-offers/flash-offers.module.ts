import { Module } from '@nestjs/common';
import { FlashOffersController } from './flash-offers.controller';
import { FlashOffersService } from './flash-offers.service';

@Module({
  controllers: [FlashOffersController],
  providers: [FlashOffersService],
  exports: [FlashOffersService],
})
export class FlashOffersModule {}
