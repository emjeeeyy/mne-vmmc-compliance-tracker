import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImmunizationsController } from './immunizations.controller';
import { ImmunizationsService } from './immunizations.service';
import { PepLogsController } from './pep-logs.controller';
import { PepLogsService } from './pep-logs.service';
import { PreEmploymentController } from './pre-employment.controller';
import { PreEmploymentService } from './pre-employment.service';

@Module({
  imports: [AuthModule],
  controllers: [PreEmploymentController, PepLogsController, ImmunizationsController],
  providers: [PreEmploymentService, PepLogsService, ImmunizationsService],
  exports: [PepLogsService, ImmunizationsService],
})
export class TrackingModule {}
