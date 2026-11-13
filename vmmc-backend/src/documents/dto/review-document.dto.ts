import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewDocumentDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Required when action is "reject".' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @ApiPropertyOptional({ description: 'Reviewer findings recorded with an approval (optional).' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Required when action is "approve" — the admin\'s digital_signatures id.' })
  @IsOptional()
  @IsString()
  signatureId?: string;

  @ApiPropertyOptional({
    enum: ['CLEARED', 'INFILTRATE'],
    description: 'The reviewer\'s reading of the chest X-ray. On approval an annual physical exam needs this or the GeneXpert result.',
  })
  @IsOptional()
  @IsIn(['CLEARED', 'INFILTRATE'])
  cxrResult?: 'CLEARED' | 'INFILTRATE';

  @ApiPropertyOptional({ enum: ['NOT_DETECTED', 'DETECTED'], description: 'The reviewer\'s reading of the GeneXpert result.' })
  @IsOptional()
  @IsIn(['NOT_DETECTED', 'DETECTED'])
  genexpertResult?: 'NOT_DETECTED' | 'DETECTED';

  @ApiPropertyOptional({ enum: ['REACTIVE', 'NON_REACTIVE'], description: 'The reviewer\'s reading of the Hep B titer. Required to approve a Hep B titer.' })
  @IsOptional()
  @IsIn(['REACTIVE', 'NON_REACTIVE'])
  titerResult?: 'REACTIVE' | 'NON_REACTIVE';
}
