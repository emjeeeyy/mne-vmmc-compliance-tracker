import { Injectable, Logger } from '@nestjs/common';
import { EscalationsService } from '../escalations/escalations.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailChannel } from './channels/email.channel';
import { ChannelResult } from './channels/sms.channel';
import { SmsChannel } from './channels/sms.channel';
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
  THREE_MONTH_HR_NOTICE: 'HR notice: this employee has remained non-compliant for 3 months after their birthday and requires follow-up.',
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
    const channels: ('IN_APP' | 'SMS' | 'EMAIL')[] =
      event.event_type === 'INFORMATIONAL' ? ['IN_APP'] : ['IN_APP', 'SMS', 'EMAIL'];

    for (const channel of channels) {
      await this.dispatchOne(channel, event, employee, body);
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
      result = recipient
        ? await this.emailChannel.send(recipient, 'VMMC TB DOTS Notification', body)
        : { status: 'FAILED', providerRef: null, retryCount: 0 };
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
