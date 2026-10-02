import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { EscalationsService } from './escalations.service';

@ApiTags('escalations')
@ApiBearerAuth('access-token')
@Controller('escalations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class EscalationsController {
  constructor(private readonly escalationsService: EscalationsService) {}

  @Get()
  @Roles('UNIT_HEAD', 'ADMIN')
  findAll(@CurrentUser() employee: EmployeeContext) {
    return this.escalationsService.findAll(employee);
  }

  @Patch(':id/acknowledge')
  @Roles('UNIT_HEAD', 'ADMIN')
  acknowledge(@CurrentUser() employee: EmployeeContext, @Param('id') id: string) {
    return this.escalationsService.acknowledge(employee, id);
  }

  @Patch(':id/resolve')
  @Roles('UNIT_HEAD', 'ADMIN')
  resolve(@CurrentUser() employee: EmployeeContext, @Param('id') id: string) {
    return this.escalationsService.resolve(employee, id);
  }
}
