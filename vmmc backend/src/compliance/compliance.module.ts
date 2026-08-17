import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceRecordService } from './compliance-record.service';

@Module({
  imports: [AuthModule],
  controllers: [ComplianceController],
  providers: [ComplianceRecordService],
  exports: [ComplianceRecordService],
})
export class ComplianceModule {}
