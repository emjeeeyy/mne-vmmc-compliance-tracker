import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PROPHYLAXIS_STATUSES } from './create-pep-log.dto';

export class UpdatePepLogDto {
  @ApiPropertyOptional({ enum: PROPHYLAXIS_STATUSES })
  @IsOptional()
  @IsIn(PROPHYLAXIS_STATUSES)
  prophylaxisStatus?: (typeof PROPHYLAXIS_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
