import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'VMMC-25-0021' })
  @IsString()
  @MinLength(1)
  employeeId: string;

  @ApiProperty({ enum: ['PERMANENT', 'COS'], required: false, example: 'PERMANENT' })
  @IsOptional()
  @IsIn(['PERMANENT', 'COS'])
  employmentType?: 'PERMANENT' | 'COS';
}
