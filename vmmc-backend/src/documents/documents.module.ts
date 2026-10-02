import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ReviewQueueController } from './review-queue.controller';

@Module({
  imports: [AuthModule, ComplianceModule, MonitoringModule, SignaturesModule],
  controllers: [DocumentsController, ReviewQueueController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
