import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuditTrailService, DEFAULT_TRAIL_LIMIT } from './audit-trail.service';
import { TrailQueryDto } from './dto/trail-query.dto';

@ApiTags('audit-trail')
@ApiBearerAuth('access-token')
@Controller('audit-trail')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  @Get()
  list(@Query() query: TrailQueryDto) {
    return this.auditTrailService.list(query.limit ?? DEFAULT_TRAIL_LIMIT);
  }
}
