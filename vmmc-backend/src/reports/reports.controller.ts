import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('UNIT_HEAD', 'ADMIN')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('delinquency')
  getDelinquency(@CurrentUser() employee: EmployeeContext, @Query('department') department?: string) {
    return this.reportsService.getDelinquencyLog(employee, department);
  }

  @Get('clearance-summary')
  getClearanceSummary(@CurrentUser() employee: EmployeeContext, @Query('department') department?: string) {
    return this.reportsService.getClearanceSummary(employee, department);
  }

  @Get('biological-matrix')
  getBiologicalMatrix(@CurrentUser() employee: EmployeeContext, @Query('department') department?: string) {
    return this.reportsService.getBiologicalMatrix(employee, department);
  }

  /** ADMIN-only — overrides the controller's UNIT_HEAD-inclusive default, see getPiiIndex(). */
  @Get('pii-index')
  @Roles('ADMIN')
  getPiiIndex() {
    return this.reportsService.getPiiIndex();
  }
}
