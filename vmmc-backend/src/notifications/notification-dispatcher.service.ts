import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EscalationsService } from '../escalations/escalations.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailChannel } from './channels/email.channel';
import { ChannelResult } from './channels/sms.channel';
import { SmsChannel } from './channels/sms.channel';
import { buildEventEmail } from './email-templates/event.template';
import { DispatchedEvent } from './types';

interface EmployeeRecipient {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

const SUBTYPE_LABELS: Record<string, string> = {
  WINDOW_OPENED: 'Your annual clearance window is now open.',
  CLEARANCE_RECORDED: 'Your medical clearance has been approved.',
  FIRST_REMINDER: 'Reminder: your annual clearance window is open — please submit your results.',
  BIRTHDAY_DUE: 'Your clearance is due today — please submit your results as soon as possible.',
  WEEKLY_REMINDER: 'Reminder: your annual clearance is still pending.',
  THREE_MONTH_HR_NOTICE: "You've been non-compliant for 3 months past your deadline. HR has been notified for follow-up — please submit your results immediately to resolve this.",
  SLA_BREACH: 'Your clearance deadline has passed without an approved submission.',
  CLINICAL_ALERT: 'Your submitted result requires immediate clinical review.',
};

/** The one place that fans an event out to notifications/escalations — the classifier
 * calls this right after it writes an event; nothing else triggers dispatch. */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly smsChannel: SmsChannel,
    private readonly emailChannel: EmailChannel,
    private readonly escalationsService: EscalationsService,
    private readonly configService: ConfigService,
  ) {}

  async handleEvent(event: DispatchedEvent) {
    const { data: employee } = await this.supabaseService
      .getClient()
      .from('employees')
      .select('id, employee_id, full_name, email, phone')
      .eq('id', event.employee_id)
      .maybeSingle<EmployeeRecipient>();
    if (!employee) return;

    const body = SUBTYPE_LABELS[event.event_subtype] ?? event.message;
    // INFORMATIONAL (WINDOW_OPENED, CLEARANCE_RECORDED) stays in-app only, deliberately —
    // these require no action, so emailing/texting every staff member for them would just
    // be noise. Only WARNING/EXCEPTION (anything that needs a response) goes out further.
    const channels: ('IN_APP' | 'SMS' | 'EMAIL')[] =
      event.event_type === 'INFORMATIONAL' ? ['IN_APP'] : ['IN_APP', 'SMS', 'EMAIL'];

    // Only the email template's detail table needs this — fetched once here rather
    // than per-channel, and only when there's actually a compliance record to read from
    // (PEP/immunization/document-rejection events have none).
    let dueDate: string | null = null;
    if (event.compliance_record_id) {
      const { data: record } = await this.supabaseService
        .getClient()
        .from('compliance_records')
        .select('due_date')
        .eq('id', event.compliance_record_id)
        .maybeSingle<{ due_date: string }>();
      dueDate = record?.due_date ?? null;
    }

    for (const channel of channels) {
      await this.dispatchOne(channel, event, employee, body, dueDate);
    }

    if (event.event_type === 'EXCEPTION') {
      await this.escalationsService.createForEvent(event);
    }
  }

  /** Powers the Layout notification bell — the employee's own in-app notifications. */
  async listMine(employeeId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('notifications')
      .select('id, channel, status, sent_at, created_at, events!inner ( event_type, event_subtype, severity, message )')
      .eq('employee_id', employeeId)
      .eq('channel', 'IN_APP')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    return (data ?? []).map((row) => {
      const event = Array.isArray(row.events) ? row.events[0] : row.events;
      return {
        id: row.id,
        status: row.status,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        eventType: event?.event_type,
        eventSubtype: event?.event_subtype,
        severity: event?.severity,
        message: event?.message,
      };
    });
  }

  private async dispatchOne(
    channel: 'IN_APP' | 'SMS' | 'EMAIL',
    event: DispatchedEvent,
    employee: EmployeeRecipient,
    body: string,
    dueDate: string | null,
  ) {
    let recipient: string | null;
    let result: ChannelResult;

    if (channel === 'IN_APP') {
      recipient = employee.employee_id;
      result = { status: 'SENT', providerRef: null, retryCount: 0 };
    } else if (channel === 'SMS') {
      recipient = employee.phone;
      result = recipient
        ? await this.smsChannel.send(recipient, body)
        : { status: 'FAILED', providerRef: null, retryCount: 0 };
    } else {
      recipient = employee.email;
      if (recipient) {
        const email = buildEventEmail({
          name: employee.full_name,
          employeeId: employee.employee_id,
          subtype: event.event_subtype,
          message: body,
          detectedAt: new Date(event.detected_at),
          dueDate,
          appBaseUrl: this.configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
        });
        result = await this.emailChannel.send(recipient, email.subject, email.text, email.html);
      } else {
        result = { status: 'FAILED', providerRef: null, retryCount: 0 };
      }
    }

    const { error } = await this.supabaseService.getClient().from('notifications').insert({
      event_id: event.id,
      employee_id: employee.id,
      channel,
      recipient: recipient ?? 'unknown',
      status: result.status,
      provider_ref: result.providerRef,
      retry_count: result.retryCount,
      sent_at: result.status === 'SENT' || result.status === 'LOGGED' ? new Date().toISOString() : null,
    });
    if (error) this.logger.error(`Failed to log ${channel} notification for event ${event.id}: ${error.message}`);
  }
}
