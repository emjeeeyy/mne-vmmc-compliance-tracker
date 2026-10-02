import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';
import { EDITABLE_FIELDS } from '../types';

export class CreateChangeRequestDto {
  @ApiProperty({ enum: EDITABLE_FIELDS })
  @IsIn(EDITABLE_FIELDS)
  fieldName: (typeof EDITABLE_FIELDS)[number];

  @ApiProperty({ example: 'Staff Nurse II' })
  @IsString()
  @MinLength(1)
  requestedValue: string;

  @ApiProperty({ example: 'Promoted last month, HR has not updated the system yet.' })
  @IsString()
  @MinLength(1)
  reason: string;
}
