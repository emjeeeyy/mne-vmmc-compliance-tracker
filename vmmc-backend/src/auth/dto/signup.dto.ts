import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'user@vmmc.gov.ph' })
  @IsString()
  @MinLength(1)
  email: string;

  @ApiProperty({ example: true, description: 'Acknowledgment of the VMMC privacy notice.' })
  @IsBoolean()
  privacyAcknowledged: boolean;

  @ApiProperty({ enum: ['PERMANENT', 'COS'], required: false, example: 'PERMANENT' })
  @IsOptional()
  @IsIn(['PERMANENT', 'COS'])
  employmentType?: 'PERMANENT' | 'COS';
}
