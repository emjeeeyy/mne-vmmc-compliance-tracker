import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const PROPHYLAXIS_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'] as const;

export class CreatePepLogDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  exposureDate: string;

  @ApiProperty({ example: 'Needlestick injury' })
  @IsString()
  @MinLength(1)
  exposureType: string;

  @ApiPropertyOptional({ enum: PROPHYLAXIS_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(PROPHYLAXIS_STATUSES)
  prophylaxisStatus?: (typeof PROPHYLAXIS_STATUSES)[number];

  @ApiPropertyOptional({ example: '2026-07-14' })
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
