import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EscalationsModule } from '../escalations/escalations.module';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationLogController } from './notification-log.controller';
import { NotificationLogService } from './notification-log.service';

@Module({
  imports: [AuthModule, EscalationsModule],
  controllers: [NotificationLogController],
  providers: [NotificationDispatcherService, NotificationLogService, SmsChannel, EmailChannel],
  exports: [NotificationDispatcherService],
})
export class NotificationsModule {}
