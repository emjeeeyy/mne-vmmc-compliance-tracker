import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Either an email address or a PH mobile number.', example: 'ana.garcia@vmmc.gov.ph' })
  @IsString()
  @MinLength(1)
  contact: string;
}
