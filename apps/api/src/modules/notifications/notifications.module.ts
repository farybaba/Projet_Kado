import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './processors/notifications.processor';
import { ExpirationReminderService } from './expiration-reminder.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  providers: [NotificationsService, NotificationsProcessor, ExpirationReminderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
