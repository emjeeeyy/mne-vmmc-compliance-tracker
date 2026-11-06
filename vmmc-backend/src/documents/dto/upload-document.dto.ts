import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDocumentDto {
  @ApiProperty({ enum: ['APE', 'HEPB_TITER'], description: 'Which screening category this upload belongs to.' })
  @IsIn(['APE', 'HEPB_TITER'])
  category: 'APE' | 'HEPB_TITER';

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

  @ApiPropertyOptional({ enum: ['REACTIVE', 'NON_REACTIVE'] })
  @IsOptional()
  @IsIn(['REACTIVE', 'NON_REACTIVE'])
  titerResult?: 'REACTIVE' | 'NON_REACTIVE';

  @ApiPropertyOptional({ description: 'Free-text document title/label, e.g. "Chest Radiograph Report 2026".' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Clinic or diagnostic facility where the exam was conducted.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  facilityName?: string;

  @ApiPropertyOptional({ description: 'Additional notes for the TB DOTS reviewer.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
