import { Module } from '@nestjs/common';
import { SignaturesService } from './signatures.service';

@Module({
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
