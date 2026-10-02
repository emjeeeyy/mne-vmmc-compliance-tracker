import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { ChangeRequestsService } from './change-requests.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';

@ApiTags('change-requests')
@ApiBearerAuth('access-token')
@Controller('change-requests')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Post()
  @Roles('STAFF', 'UNIT_HEAD', 'ADMIN')
  create(@CurrentUser() employee: EmployeeContext, @Body() dto: CreateChangeRequestDto) {
    return this.changeRequestsService.create(employee, dto);
  }

  @Get('mine')
  @Roles('STAFF', 'UNIT_HEAD', 'ADMIN')
  findMine(@CurrentUser() employee: EmployeeContext) {
    return this.changeRequestsService.findMine(employee);
  }

  @Get()
  @Roles('ADMIN')
  findPending() {
    return this.changeRequestsService.findPending();
  }

  @Patch(':id/approve')
  @Roles('ADMIN')
  approve(@CurrentUser() employee: EmployeeContext, @Param('id') id: string) {
    return this.changeRequestsService.approve(employee, id);
  }

  @Patch(':id/reject')
  @Roles('ADMIN')
  reject(@CurrentUser() employee: EmployeeContext, @Param('id') id: string, @Body() dto: RejectChangeRequestDto) {
    return this.changeRequestsService.reject(employee, id, dto);
  }
}
