import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTwoFactorDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
