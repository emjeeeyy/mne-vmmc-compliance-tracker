import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ example: 'iPhone 14 Pro' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'Mobile' })
  @IsOptional()
  @IsString()
  deviceType?: string;
}
