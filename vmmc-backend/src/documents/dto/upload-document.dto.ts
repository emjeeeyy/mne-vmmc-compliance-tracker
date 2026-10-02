import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UploadDocumentDto {
  @ApiProperty({ description: 'Date the exam/test was taken.', example: '2026-06-15' })
  @IsDateString()
  examDate: string;

  @ApiPropertyOptional({ enum: ['CLEARED', 'INFILTRATE'] })
  @IsOptional()
  @IsIn(['CLEARED', 'INFILTRATE'])
  cxrResult?: 'CLEARED' | 'INFILTRATE';

  @ApiPropertyOptional({ enum: ['NOT_DETECTED', 'DETECTED'] })
  @IsOptional()
  @IsIn(['NOT_DETECTED', 'DETECTED'])
  genexpertResult?: 'NOT_DETECTED' | 'DETECTED';
}
