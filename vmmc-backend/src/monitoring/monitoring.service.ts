import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComplianceRecordService } from '../compliance/compliance-record.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ImmunizationsService } from '../tracking/immunizations.service';
import { PepLogsService } from '../tracking/pep-logs.service';
import { EventClassifierService } from './event-classifier.service';
import { ComplianceRecordRow, EventSubtype } from './types';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly complianceRecordService: ComplianceRecordService,
    private readonly eventClassifier: EventClassifierService,
    private readonly pepLogsService: PepLogsService,
    private readonly immunizationsService: ImmunizationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'Asia/Manila' })
  async scheduledScan() {
    const summary = await this.runScan();
    this.logger.log(`Scheduled scan: ${JSON.stringify(summary)}`);
  }

  async runScan() {
    await this.complianceRecordService.ensureCurrentCycleRecords();
    const cycleYear = new Date().getUTCFullYear();
    const today = new Date();

    const { data: records, error } = await this.supabaseService
      .getClient()
      .from('compliance_records')
      .select('id, employee_id, cycle_year, birthday_date, window_open_date, due_date, status, clinical_status')
      .eq('cycle_year', cycleYear)
      .returns<ComplianceRecordRow[]>();
    if (error) throw error;

    const eventsEmitted: Partial<Record<EventSubtype, number>> = {};
    let recordsProcessed = 0;

    for (const record of records ?? []) {
      const emitted = await this.eventClassifier.classify(record, today);
      recordsProcessed += 1;
      for (const subtype of emitted) {
        eventsEmitted[subtype] = (eventsEmitted[subtype] ?? 0) + 1;
      }
    }

    const overduePepLogs = await this.pepLogsService.findOverdueFollowUps();
    for (const log of overduePepLogs) {
      const emitted = await this.eventClassifier.classifyPepFollowUp(log);
      if (emitted) eventsEmitted.PEP_FOLLOWUP_MISSED = (eventsEmitted.PEP_FOLLOWUP_MISSED ?? 0) + 1;
    }

    const overdueDoses = await this.immunizationsService.findOverdueDoses();
    for (const dose of overdueDoses) {
      const emitted = await this.eventClassifier.classifyImmunizationOverdue(dose);
      if (emitted) eventsEmitted.IMMUNIZATION_OVERDUE = (eventsEmitted.IMMUNIZATION_OVERDUE ?? 0) + 1;
    }

    return { recordsProcessed, eventsEmitted };
  }
}
