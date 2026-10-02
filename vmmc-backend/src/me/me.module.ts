import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { ActivityService } from './activity.service';
import { DevicesService } from './devices.service';
import { MeController } from './me.controller';
import { ProfileService } from './profile.service';
import { SecurityService } from './security.service';

@Module({
  imports: [AuthModule, ComplianceModule, DocumentsModule, SignaturesModule, NotificationsModule],
  controllers: [MeController],
  providers: [ProfileService, SecurityService, DevicesService, ActivityService],
})
export class MeModule {}
