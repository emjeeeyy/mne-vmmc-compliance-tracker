import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';

@Module({
  imports: [AuthModule],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
