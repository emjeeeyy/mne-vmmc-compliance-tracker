import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EscalationsController } from './escalations.controller';
import { EscalationsService } from './escalations.service';

@Module({
  imports: [AuthModule],
  controllers: [EscalationsController],
  providers: [EscalationsService],
  exports: [EscalationsService],
})
export class EscalationsModule {}
