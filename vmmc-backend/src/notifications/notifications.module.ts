import { Module } from '@nestjs/common';
import { EscalationsModule } from '../escalations/escalations.module';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [EscalationsModule],
  providers: [NotificationDispatcherService, SmsChannel, EmailChannel],
  exports: [NotificationDispatcherService],
})
export class NotificationsModule {}
