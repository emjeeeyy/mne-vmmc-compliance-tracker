import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@CurrentUser() employee: EmployeeContext) {
    return this.dashboardService.getOverview(employee);
  }

  @Get('trend')
  getTrend(@CurrentUser() employee: EmployeeContext, @Query('scope') scope?: 'dept' | 'hospital') {
    const resolvedScope = scope === 'hospital' && employee.role === 'ADMIN' ? 'hospital' : 'dept';
    return this.dashboardService.getTrend(employee, resolvedScope);
  }
}
