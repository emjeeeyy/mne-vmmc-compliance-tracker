import { Body, Controller, Param, Patch, Post, Headers, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsService } from './documents.service';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@ApiTags('documents')
@ApiBearerAuth('access-token')
@Controller('documents')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Idempotent()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        examDate: { type: 'string', format: 'date' },
        cxrResult: { type: 'string', enum: ['CLEARED', 'INFILTRATE'] },
        genexpertResult: { type: 'string', enum: ['NOT_DETECTED', 'DETECTED'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  upload(
    @CurrentUser() employee: EmployeeContext,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.documentsService.upload(employee, file, dto, idempotencyKey);
  }

  @Patch(':id/review')
  @Roles('ADMIN')
  review(@CurrentUser() admin: EmployeeContext, @Param('id') id: string, @Body() dto: ReviewDocumentDto) {
    return this.documentsService.review(admin, id, dto);
  }
}
