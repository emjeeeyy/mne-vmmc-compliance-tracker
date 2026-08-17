import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateImmunizationDto {
  @ApiProperty({ example: 'Hepatitis B' })
  @IsString()
  @MinLength(1)
  vaccineType: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dose: number;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  administeredDate: string;

  @ApiPropertyOptional({ description: 'When the next dose in this series is due (drives the ~quarterly cadence).' })
  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @ApiPropertyOptional({ example: 'Q3' })
  @IsOptional()
  @IsString()
  quarter?: string;
}
