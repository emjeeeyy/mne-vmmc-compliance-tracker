import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: 'Same contact used in the forgot-password request.' })
  @IsString()
  @MinLength(1)
  contact: string;

  @ApiProperty({ description: '6-digit code.', example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;
}
