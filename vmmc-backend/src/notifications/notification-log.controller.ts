import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { LogQueryDto } from './dto/log-query.dto';
import { DEFAULT_LOG_LIMIT, NotificationLogService } from './notification-log.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('ADMIN')
export class NotificationLogController {
  constructor(private readonly notificationLogService: NotificationLogService) {}

  @Get('log')
  getLog(@Query() query: LogQueryDto) {
    return this.notificationLogService.getLog(query.limit ?? DEFAULT_LOG_LIMIT);
  }
}
