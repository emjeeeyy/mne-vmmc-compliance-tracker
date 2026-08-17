import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TrackerQueryDto {
  @ApiPropertyOptional({ description: 'Matches against full name or Employee ID.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Department code (e.g. OPD, RAD, DIET, ADM).' })
  @IsOptional()
  @IsString()
  department?: string;
}
