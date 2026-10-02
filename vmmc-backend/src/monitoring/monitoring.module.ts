import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { EventClassifierService } from './event-classifier.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AuthModule, ComplianceModule, NotificationsModule, TrackingModule],
  controllers: [MonitoringController],
  providers: [EventClassifierService, MonitoringService],
  exports: [MonitoringService, EventClassifierService],
})
export class MonitoringModule {}
