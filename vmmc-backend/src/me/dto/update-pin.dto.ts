import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdatePinDto {
  @ApiPropertyOptional({ description: 'Required unless no PIN has ever been set on this account.' })
  @IsOptional()
  @IsString()
  currentPin?: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4-6 digits.' })
  newPin: string;
}
