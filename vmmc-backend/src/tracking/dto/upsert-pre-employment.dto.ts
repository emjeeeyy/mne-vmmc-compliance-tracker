import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertPreEmploymentDto {
  @ApiPropertyOptional({ description: 'Storage reference for the baseline chest X-ray, if captured.' })
  @IsOptional()
  @IsString()
  baselineXrayPath?: string;

  @ApiPropertyOptional({ description: 'Free-text baseline screening result.' })
  @IsOptional()
  @IsString()
  screeningResult?: string;

  @ApiPropertyOptional({ description: 'Whether the employee has been cleared fit for duty.' })
  @IsOptional()
  @IsBoolean()
  fitForDuty?: boolean;
}
