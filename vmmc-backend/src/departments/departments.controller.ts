import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { DepartmentsService } from './departments.service';

@ApiTags('departments')
@ApiBearerAuth('access-token')
@Controller('departments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Roles('UNIT_HEAD', 'ADMIN')
  findAll() {
    return this.departmentsService.findAll();
  }
}
