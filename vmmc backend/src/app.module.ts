import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChangeRequestsModule } from './change-requests/change-requests.module';
import { ComplianceModule } from './compliance/compliance.module';
import { validate } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { DepartmentsModule } from './departments/departments.module';
import { DocumentsModule } from './documents/documents.module';
import { EscalationsModule } from './escalations/escalations.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    SupabaseModule,
    AuditModule,
    AuthModule,
    HealthModule,
    MeModule,
    DepartmentsModule,
    ComplianceModule,
    DocumentsModule,
    MonitoringModule,
    EscalationsModule,
    NotificationsModule,
    DashboardModule,
    ReportsModule,
    TrackingModule,
    ChangeRequestsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
