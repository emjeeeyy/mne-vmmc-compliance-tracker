import { Injectable, Logger } from '@nestjs/common';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ImmunizationRow } from '../tracking/immunizations.service';
import { PepLogRow } from '../tracking/pep-logs.service';
import { ComplianceRecordRow, EventSubtype, EventType } from './types';

const WEEKLY_REMINDER_INTERVAL_DAYS = 7;

interface ApprovedDocument {
  id: string;
  cxr_result: string;
  genexpert_result: string;
}

function isPositiveResult(doc: ApprovedDocument) {
  return doc.cxr_result === 'INFILTRATE' || doc.genexpert_result === 'DETECTED';
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * The only thing in the system that writes to `events` or mutates
 * compliance_records.status/clinical_status. Every emission is gated on what
 * already exists in `events` for the record, so re-running classify() on the
 * same record + same day is always a no-op past the first pass (de-duplication).
 */
@Injectable()
export class EventClassifierService {
  private readonly logger = new Logger(EventClassifierService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
  ) {}

  async classify(record: ComplianceRecordRow, today: Date): Promise<EventSubtype[]> {
    if (record.status === 'COMPLIANT') return [];

    const client = this.supabaseService.getClient();
    const emitted: EventSubtype[] = [];

    const { data: existingEvents } = await client
      .from('events')
      .select('event_subtype, detected_at')
      .eq('compliance_record_id', record.id)
      .order('detected_at', { ascending: false });

    const subtypesSeen = new Set((existingEvents ?? []).map((e) => e.event_subtype));

    if (!existingEvents || existingEvents.length === 0) {
      await this.emit(record, 'INFORMATIONAL', 'WINDOW_OPENED', 0, `Tracking window opened for cycle ${record.cycle_year}.`);
      emitted.push('WINDOW_OPENED');
    }

    // Clinical dimension — independent of the SLA timeline, can fire regardless of it.
    const { data: approvedDoc } = await client
      .from('documents')
      .select('id, cxr_result, genexpert_result')
      .eq('compliance_record_id', record.id)
      .eq('review_status', 'APPROVED')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle<ApprovedDocument>();

    if (approvedDoc) {
      if (isPositiveResult(approvedDoc)) {
        if (!subtypesSeen.has('CLINICAL_ALERT')) {
          await client.from('compliance_records').update({ clinical_status: 'CRITICAL' }).eq('id', record.id);
          await this.emit(
            record,
            'EXCEPTION',
            'CLINICAL_ALERT',
            2,
            'Approved result is positive — restricted pending clinical review.',
          );
          emitted.push('CLINICAL_ALERT');
        }
      } else if (!subtypesSeen.has('CLEARANCE_RECORDED')) {
        const clinicalUpdate = record.clinical_status === 'CRITICAL' ? {} : { clinical_status: 'COMPLIANT' };
        // Positive lead time = cleared before the deadline; negative = cleared after (late clearance).
        const leadTimeDays = daysBetween(new Date(record.due_date), today);
        await client
          .from('compliance_records')
          .update({ status: 'COMPLIANT', cleared_at: today.toISOString(), lead_time_days: leadTimeDays, ...clinicalUpdate })
          .eq('id', record.id);
        await this.emit(record, 'INFORMATIONAL', 'CLEARANCE_RECORDED', 0, 'Negative clearance approved and signed.');
        emitted.push('CLEARANCE_RECORDED');
        return emitted; // resolved — no timeline events needed once cleared
      }
    }

    // Timeline dimension.
    const due = new Date(record.due_date);
    const birthday = new Date(record.birthday_date);
    const windowOpen = new Date(record.window_open_date);

    if (today > due) {
      if (!subtypesSeen.has('SLA_BREACH')) {
        await client.from('compliance_records').update({ status: 'OVERDUE' }).eq('id', record.id);
        await this.emit(record, 'EXCEPTION', 'SLA_BREACH', 2, 'Birth-month deadline passed with no approved clearance.');
        emitted.push('SLA_BREACH');
      }

      // EXCEPTION (not WARNING) — the most severe non-clinical state in the system, and
      // bumping it here also routes it into the escalations queue via the same
      // EXCEPTION handling everything else gets (see NotificationDispatcherService).
      const daysAfterBirthday = daysBetween(today, new Date(record.birthday_date));
      if (daysAfterBirthday >= 90 && !subtypesSeen.has('THREE_MONTH_HR_NOTICE')) {
        await this.emit(
          record,
          'EXCEPTION',
          'THREE_MONTH_HR_NOTICE',
          2,
          'Three months after birthday with no approved clearance — HR follow-up required.',
        );
        emitted.push('THREE_MONTH_HR_NOTICE');
      }
    } else if (today >= birthday) {
      if (!subtypesSeen.has('BIRTHDAY_DUE')) {
        await client.from('compliance_records').update({ status: 'NON_COMPLIANT' }).eq('id', record.id);
        await this.emit(record, 'WARNING', 'BIRTHDAY_DUE', 1, 'Birthday reached with no submission yet.');
        emitted.push('BIRTHDAY_DUE');
      } else {
        const lastReminder = existingEvents?.find(
          (e) => e.event_subtype === 'BIRTHDAY_DUE' || e.event_subtype === 'WEEKLY_REMINDER',
        );
        const daysSince = lastReminder ? daysBetween(today, new Date(lastReminder.detected_at)) : Infinity;
        if (daysSince >= WEEKLY_REMINDER_INTERVAL_DAYS) {
          await this.emit(record, 'WARNING', 'WEEKLY_REMINDER', 1, 'Weekly reminder — still no submission.');
          emitted.push('WEEKLY_REMINDER');
        }
      }

      const daysAfterBirthday = daysBetween(today, new Date(record.birthday_date));
      if (daysAfterBirthday >= 90 && !subtypesSeen.has('THREE_MONTH_HR_NOTICE')) {
        await this.emit(
          record,
          'EXCEPTION',
          'THREE_MONTH_HR_NOTICE',
          2,
          'Three months after birthday with no approved clearance — HR follow-up required.',
        );
        emitted.push('THREE_MONTH_HR_NOTICE');
      }
    } else if (today >= windowOpen) {
      if (!subtypesSeen.has('FIRST_REMINDER')) {
        await client.from('compliance_records').update({ status: 'NON_COMPLIANT' }).eq('id', record.id);
        await this.emit(record, 'WARNING', 'FIRST_REMINDER', 1, 'First reminder — clearance window is now open.');
        emitted.push('FIRST_REMINDER');
      }
    }

    return emitted;
  }

  /** PEP logs aren't compliance_records — de-dup is by payload.sourceId instead of compliance_record_id. */
  async classifyPepFollowUp(log: PepLogRow): Promise<boolean> {
    const already = await this.hasSourceEvent(log.id);
    if (already) return false;

    await this.emitOther(
      log.employee_id,
      'WARNING',
      'PEP_FOLLOWUP_MISSED',
      1,
      `Post-exposure prophylaxis follow-up for "${log.exposure_type}" (exposed ${log.exposure_date}) is overdue.`,
      log.id,
    );
    return true;
  }

  async classifyImmunizationOverdue(dose: ImmunizationRow): Promise<boolean> {
    const already = await this.hasSourceEvent(dose.id);
    if (already) return false;

    await this.emitOther(
      dose.employee_id,
      'WARNING',
      'IMMUNIZATION_OVERDUE',
      1,
      `Next ${dose.vaccine_type} dose (after dose ${dose.dose}, administered ${dose.administered_date}) is overdue.`,
      dose.id,
    );
    return true;
  }

  /** Called directly from DocumentsService.review() on reject — not part of the
   * daily classify() sweep, since a rejection is a one-off reviewer action, not
   * something that gets re-detected by scanning compliance_records. De-duped on
   * documentId like PEP/immunization above, though in practice a document can
   * only ever be reviewed once (documents.service.ts guards against re-review). */
  async classifyDocumentRejected(documentId: string, employeeId: string, reason: string): Promise<boolean> {
    const already = await this.hasSourceEvent(documentId);
    if (already) return false;

    await this.emitOther(
      employeeId,
      'WARNING',
      'DOCUMENT_REJECTED',
      1,
      `Your submitted document was not approved: ${reason}`,
      documentId,
    );
    return true;
  }

  private async hasSourceEvent(sourceId: string): Promise<boolean> {
    const { data } = await this.supabaseService
      .getClient()
      .from('events')
      .select('id')
      .eq('payload->>sourceId', sourceId)
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }

  private async emitOther(
    employeeId: string,
    eventType: EventType,
    subtype: EventSubtype,
    severity: number,
    message: string,
    sourceId: string,
  ) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .insert({
        employee_id: employeeId,
        compliance_record_id: null,
        event_type: eventType,
        event_subtype: subtype,
        severity,
        message,
        source: 'monitoring-engine',
        payload: { sourceId },
      })
      .select('id, employee_id, compliance_record_id, event_type, event_subtype, severity, message, detected_at')
      .single();

    if (error) {
      this.logger.error(`Failed to emit ${subtype} for source ${sourceId}: ${error.message}`);
      return;
    }

    await this.notificationDispatcherService.handleEvent(data);
  }

  private async emit(
    record: ComplianceRecordRow,
    eventType: EventType,
    subtype: EventSubtype,
    severity: number,
    message: string,
  ) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .insert({
        employee_id: record.employee_id,
        compliance_record_id: record.id,
        event_type: eventType,
        event_subtype: subtype,
        severity,
        message,
        source: 'monitoring-engine',
      })
      .select('id, employee_id, compliance_record_id, event_type, event_subtype, severity, message, detected_at')
      .single();

    if (error) {
      this.logger.error(`Failed to emit ${subtype} for record ${record.id}: ${error.message}`);
      return;
    }

    await this.notificationDispatcherService.handleEvent(data);
  }
}
