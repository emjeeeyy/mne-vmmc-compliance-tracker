import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class FirstLoginPasswordChangeDto {
  @ApiProperty({ example: 'VMMC-25-0021' })
  @IsString()
  @MinLength(1)
  employeeId: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
