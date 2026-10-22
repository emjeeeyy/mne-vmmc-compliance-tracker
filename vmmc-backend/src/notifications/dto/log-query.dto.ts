import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_LOG_LIMIT } from '../notification-log.service';

export class LogQueryDto {
  @ApiPropertyOptional({ description: 'How many of the most recent events to return.', default: 30, maximum: MAX_LOG_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LOG_LIMIT)
  limit?: number;
}
