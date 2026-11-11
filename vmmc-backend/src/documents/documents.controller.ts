import { Body, Controller, Get, Param, Patch, Post, Headers, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
        category: { type: 'string', enum: ['APE', 'HEPB_TITER'] },
        examDate: { type: 'string', format: 'date' },
        // Optional and no longer sent by the app: the reviewer records the result when approving. Kept so an older
        // client still works; a value sent here is only a pre-fill for the reviewer to confirm or correct.
        cxrResult: { type: 'string', enum: ['CLEARED', 'INFILTRATE'], description: 'Optional pre-fill; the reviewer records the result.' },
        genexpertResult: { type: 'string', enum: ['NOT_DETECTED', 'DETECTED'], description: 'Optional pre-fill; the reviewer records the result.' },
        titerResult: { type: 'string', enum: ['REACTIVE', 'NON_REACTIVE'], description: 'Optional pre-fill; the reviewer records the result.' },
        title: { type: 'string' },
        facilityName: { type: 'string' },
        notes: { type: 'string' },
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

  /** A short-lived link to view an uploaded file. Access follows assertDocumentAccess: the owner, ADMIN, a unit
   * head for their own department, and TB DOTS / HR staff. */
  @Get(':id/file-url')
  getFileUrl(@CurrentUser() currentUser: EmployeeContext, @Param('id') id: string) {
    return this.documentsService.getFileUrl(currentUser, id);
  }

  /** Approving or rejecting is the TB DOTS administrator's job (they read the file, record the result and sign). */
  @Patch(':id/review')
  @Roles('ADMIN')
  review(@CurrentUser() currentUser: EmployeeContext, @Param('id') id: string, @Body() dto: ReviewDocumentDto) {
    return this.documentsService.review(currentUser, id, dto);
  }
}
