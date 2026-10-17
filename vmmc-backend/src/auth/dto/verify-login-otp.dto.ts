import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, MinLength } from 'class-validator';

export class VerifyLoginOtpDto {
  @ApiProperty({ example: 'VMMC-23-0002' })
  @IsString()
  @MinLength(1)
  employeeId: string;

  @ApiProperty({ enum: ['staff', 'admin'] })
  @IsIn(['staff', 'admin'])
  portal: 'staff' | 'admin';

  @ApiProperty({ description: '6-digit code.', example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;
}
