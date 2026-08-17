import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@ApiBearerAuth('access-token')
@Controller('monitoring')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  /** Manual trigger for the demo — the same logic the daily cron runs. ADMIN only. */
  @Post('run-scan')
  @Roles('ADMIN')
  runScan() {
    return this.monitoringService.runScan();
  }
}
