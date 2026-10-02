import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ReviewDocumentDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Required when action is "reject".' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @ApiPropertyOptional({ description: 'Required when action is "approve" — the admin\'s digital_signatures id.' })
  @IsOptional()
  @IsString()
  signatureId?: string;
}
