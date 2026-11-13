import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditTrailController } from './audit-trail.controller';
import { AuditTrailService } from './audit-trail.service';

@Module({
  imports: [AuthModule],
  controllers: [AuditTrailController],
  providers: [AuditTrailService],
})
export class AuditTrailModule {}
