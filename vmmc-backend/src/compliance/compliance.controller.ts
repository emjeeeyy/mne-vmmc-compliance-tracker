import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { ComplianceRecordService } from './compliance-record.service';
import { TrackerQueryDto } from './dto/tracker-query.dto';

@ApiTags('compliance')
@ApiBearerAuth('access-token')
@Controller('compliance')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ComplianceController {
  constructor(private readonly complianceRecordService: ComplianceRecordService) {}

  @Get('tracker')
  @Roles('UNIT_HEAD', 'ADMIN')
  getTracker(@CurrentUser() employee: EmployeeContext, @Query() query: TrackerQueryDto) {
    return this.complianceRecordService.getTracker(employee, query.search, query.department);
  }

  @Get('employees/:id/dossier')
  getDossier(@CurrentUser() employee: EmployeeContext, @Param('id') id: string) {
    return this.complianceRecordService.getDossier(employee, id);
  }
}
