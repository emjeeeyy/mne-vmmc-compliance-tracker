import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { EmailChannel } from '../notifications/channels/email.channel';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

// EmailChannel is provided directly here (not imported via NotificationsModule) to avoid a
// circular dependency: NotificationsModule -> EscalationsModule -> AuthModule already exists.
// EmailChannel itself only depends on ConfigService, so a second instance here is harmless.
@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard, RolesGuard, EmailChannel],
  exports: [SupabaseAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
