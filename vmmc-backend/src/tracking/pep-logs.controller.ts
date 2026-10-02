import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CreatePepLogDto } from './dto/create-pep-log.dto';
import { UpdatePepLogDto } from './dto/update-pep-log.dto';
import { PepLogsService } from './pep-logs.service';

@ApiTags('pep-logs')
@ApiBearerAuth('access-token')
@Controller('pep-logs')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PepLogsController {
  constructor(private readonly pepLogsService: PepLogsService) {}

  @Get(':employeeId')
  listForEmployee(@CurrentUser() employee: EmployeeContext, @Param('employeeId') employeeId: string) {
    return this.pepLogsService.listForEmployee(employee, employeeId);
  }

  @Post(':employeeId')
  @Roles('ADMIN')
  @Idempotent()
  create(@Param('employeeId') employeeId: string, @Body() dto: CreatePepLogDto) {
    return this.pepLogsService.create(employeeId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() employee: EmployeeContext, @Param('id') id: string, @Body() dto: UpdatePepLogDto) {
    return this.pepLogsService.update(employee, id, dto);
  }
}
