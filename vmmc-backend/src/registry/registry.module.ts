import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';

@Module({
  imports: [AuthModule, ComplianceModule],
  controllers: [RegistryController],
  providers: [RegistryService],
})
export class RegistryModule {}
