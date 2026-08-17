import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'VMMC-23-0002' })
  @IsString()
  @MinLength(1)
  employeeId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;

  @ApiProperty({ enum: ['staff', 'admin'] })
  @IsIn(['staff', 'admin'])
  portal: 'staff' | 'admin';
}
