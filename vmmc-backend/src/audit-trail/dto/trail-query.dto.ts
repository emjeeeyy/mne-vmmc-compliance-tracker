import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_TRAIL_LIMIT } from '../audit-trail.service';

export class TrailQueryDto {
  @ApiPropertyOptional({ description: 'How many recent entries to return.', default: 25, maximum: MAX_TRAIL_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRAIL_LIMIT)
  limit?: number;
}
