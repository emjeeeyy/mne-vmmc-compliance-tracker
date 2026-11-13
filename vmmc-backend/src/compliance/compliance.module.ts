import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceRecordService } from './compliance-record.service';
import { SlaSettingsService } from './sla-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [ComplianceController],
  providers: [ComplianceRecordService, SlaSettingsService],
  exports: [ComplianceRecordService, SlaSettingsService],
})
export class ComplianceModule {}
