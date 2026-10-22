import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type LogChannel = 'IN_APP' | 'SMS' | 'EMAIL';

export interface NotificationLogEntry {
  id: string;
  eventType: 'INFORMATIONAL' | 'WARNING' | 'EXCEPTION';
  eventSubtype: string;
  severity: number;
  message: string;
  detectedAt: string;
  employee: { employeeId: string; fullName: string; department: string };
  /** One entry per channel the event was dispatched on, in a fixed order. status is the real outcome. */
  channels: { channel: LogChannel; status: string; sentAt: string | null }[];
}

interface EmployeeEmbed {
  employee_id: string;
  full_name: string;
  departments: { name: string } | { name: string }[] | null;
}

export interface LogRow {
  id: string;
  event_type: NotificationLogEntry['eventType'];
  event_subtype: string;
  severity: number;
  message: string;
  detected_at: string;
  employees: EmployeeEmbed | EmployeeEmbed[] | null;
  notifications: { channel: LogChannel; status: string; sent_at: string | null; created_at?: string }[] | null;
}

export const DEFAULT_LOG_LIMIT = 30;
export const MAX_LOG_LIMIT = 100;

const CHANNEL_ORDER: LogChannel[] = ['IN_APP', 'SMS', 'EMAIL'];
const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Pure mapping from the joined rows to the API shape, so channel ordering and the missing-employee case are tested directly. */
export function toLogEntries(rows: LogRow[]): NotificationLogEntry[] {
  return rows.map((row) => {
    const employee = first(row.employees);
    const department = employee ? first(employee.departments) : null;
    const latestPerChannel = new Map<LogChannel, NonNullable<LogRow['notifications']>[number]>();
    for (const n of row.notifications ?? []) {
      const seen = latestPerChannel.get(n.channel);
      if (!seen || (n.created_at ?? '') >= (seen.created_at ?? '')) latestPerChannel.set(n.channel, n);
    }
    return {
      id: row.id,
      eventType: row.event_type,
      eventSubtype: row.event_subtype,
      severity: row.severity,
      message: row.message,
      detectedAt: row.detected_at,
      employee: {
        employeeId: employee?.employee_id ?? '—',
        fullName: employee?.full_name ?? 'Unknown employee',
        department: department?.name ?? 'Unassigned',
      },
      channels: CHANNEL_ORDER.filter((c) => latestPerChannel.has(c)).map((c) => {
        const n = latestPerChannel.get(c)!;
        return { channel: c, status: n.status, sentAt: n.sent_at };
      }),
    };
  });
}

/** Admin view of what the monitoring engine has dispatched, newest first: one row per event with the real
 * outcome of each channel (the `notifications` table holds one row per channel attempt). */
@Injectable()
export class NotificationLogService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getLog(limit: number = DEFAULT_LOG_LIMIT): Promise<NotificationLogEntry[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .select(
        `id, event_type, event_subtype, severity, message, detected_at,
         employees ( employee_id, full_name, departments!employees_department_id_fkey ( name ) ),
         notifications ( channel, status, sent_at, created_at )`,
      )
      .order('detected_at', { ascending: false })
      .limit(Math.min(Math.max(1, limit), MAX_LOG_LIMIT))
      .returns<LogRow[]>();
    if (error) throw error;
    return toLogEntries(data ?? []);
  }
}
