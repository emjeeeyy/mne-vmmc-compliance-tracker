import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { UpsertPreEmploymentDto } from './dto/upsert-pre-employment.dto';
import { PreEmploymentService } from './pre-employment.service';

@ApiTags('pre-employment')
@ApiBearerAuth('access-token')
@Controller('pre-employment')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PreEmploymentController {
  constructor(private readonly preEmploymentService: PreEmploymentService) {}

  @Get(':employeeId')
  get(@CurrentUser() employee: EmployeeContext, @Param('employeeId') employeeId: string) {
    return this.preEmploymentService.get(employee, employeeId);
  }

  @Put(':employeeId')
  @Roles('ADMIN')
  @Idempotent()
  upsert(@Param('employeeId') employeeId: string, @Body() dto: UpsertPreEmploymentDto) {
    return this.preEmploymentService.upsert(employeeId, dto);
  }
}
