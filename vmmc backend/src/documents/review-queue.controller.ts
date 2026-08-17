import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@Controller('review-queue')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ReviewQueueController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @Roles('ADMIN')
  getQueue() {
    return this.documentsService.getReviewQueue();
  }
}
