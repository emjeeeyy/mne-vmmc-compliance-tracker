import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@Controller('review-queue')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ReviewQueueController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @Roles('ADMIN', 'UNIT_HEAD', 'STAFF')
  getQueue(@CurrentUser() currentUser: EmployeeContext) {
    return this.documentsService.getReviewQueue(currentUser);
  }
}
