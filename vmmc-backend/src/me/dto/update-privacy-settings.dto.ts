import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePrivacySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  encryptRecords?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shareAnalytics?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telemetryLogging?: boolean;
}
