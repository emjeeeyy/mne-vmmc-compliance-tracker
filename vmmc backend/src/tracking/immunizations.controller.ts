import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CreateImmunizationDto } from './dto/create-immunization.dto';
import { ImmunizationsService } from './immunizations.service';

@ApiTags('immunizations')
@ApiBearerAuth('access-token')
@Controller('immunizations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ImmunizationsController {
  constructor(private readonly immunizationsService: ImmunizationsService) {}

  @Get(':employeeId')
  listForEmployee(@CurrentUser() employee: EmployeeContext, @Param('employeeId') employeeId: string) {
    return this.immunizationsService.listForEmployee(employee, employeeId);
  }

  @Post(':employeeId')
  @Roles('ADMIN')
  @Idempotent()
  create(@Param('employeeId') employeeId: string, @Body() dto: CreateImmunizationDto) {
    return this.immunizationsService.create(employeeId, dto);
  }
}
