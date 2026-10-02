import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UploadSignatureDto {
  @ApiProperty({ description: 'Base64 PNG data URL, e.g. from canvas.toDataURL("image/png").' })
  @IsString()
  @MinLength(1)
  imageDataUrl: string;
}
