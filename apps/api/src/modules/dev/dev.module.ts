import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';

/**
 * Module uniquement importé quand APP_ENV=development (voir AppModule).
 * Ne jamais exporter ni importer dans un contexte de production.
 */
@Module({
  controllers: [DevController],
  providers: [DevService],
})
export class DevModule {}
