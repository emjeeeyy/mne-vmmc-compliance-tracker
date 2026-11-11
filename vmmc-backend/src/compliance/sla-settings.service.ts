import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * The reminder and target settings the annual physical exam (APE) SLA row stores in `sla_definitions`, in the units the
 * code uses. Before this, the table's weekly_reminder and target_rate columns were never read: the weekly gap was a
 * constant of 7 days in the classifier and the "95%" on the admin dashboard was typed text.
 *
 * Only the APE row is read. The IMMUNIZATION row (and the `recurrence` column) is deliberately NOT: immunization
 * reminders are driven by each dose's own next_due_date (one alert when a dose is overdue), so those stored values
 * would be decoration. See docs (PROGRESS_REPORT_3 Part AD) before wiring them.
 */
export interface ApeSlaSettings {
  /** When false the classifier sends no weekly reminders (the birthday-day and overdue notices are unaffected). */
  weeklyReminderEnabled: boolean;
  /** Days between weekly reminders after the birthday has passed. */
  weeklyReminderIntervalDays: number;
  /** The clearance-rate goal, as a whole percent (0.95 is stored, 95 is used). */
  targetPercent: number;
}

/** What the code did before the settings were read, so wiring them up changes nothing until someone edits the row. */
export const DEFAULT_APE_SLA_SETTINGS: ApeSlaSettings = {
  weeklyReminderEnabled: true,
  weeklyReminderIntervalDays: 7,
  targetPercent: 95,
};

interface SlaRow {
  weekly_reminder?: boolean | null;
  weekly_reminder_interval_days?: number | string | null;
  // Postgres `numeric` comes back as a number or a string depending on the client.
  target_rate?: number | string | null;
}

/** Pure, so the rules are tested directly. Anything missing or out of range falls back to the default instead of
 * throwing: a typo in a settings row must not stop the nightly scan or the dashboard. */
export function parseApeSlaSettings(row: SlaRow | null | undefined): ApeSlaSettings {
  const d = DEFAULT_APE_SLA_SETTINGS;
  if (!row) return d;
  const interval = Number(row.weekly_reminder_interval_days);
  const rate = Number(row.target_rate);
  return {
    weeklyReminderEnabled: typeof row.weekly_reminder === 'boolean' ? row.weekly_reminder : d.weeklyReminderEnabled,
    weeklyReminderIntervalDays: Number.isInteger(interval) && interval >= 1 && interval <= 90 ? interval : d.weeklyReminderIntervalDays,
    targetPercent: rate > 0 && rate <= 1 ? Math.round(rate * 100) : d.targetPercent,
  };
}

const CACHE_MS = 60_000;

/** Reads the APE settings once a minute at most, so a change in the database takes effect without a redeploy and
 * without a query per record during a scan. */
@Injectable()
export class SlaSettingsService {
  private readonly logger = new Logger(SlaSettingsService.name);
  private cache: { at: number; value: ApeSlaSettings } | null = null;

  constructor(private readonly supabaseService: SupabaseService) {}

  async getApe(now: number = Date.now()): Promise<ApeSlaSettings> {
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.value;
    const value = await this.load();
    this.cache = { at: now, value };
    return value;
  }

  private async load(): Promise<ApeSlaSettings> {
    const client = this.supabaseService.getClient();
    const query = (columns: string) =>
      client.from('sla_definitions').select(columns).eq('tracking_type', 'APE').eq('active', true).maybeSingle<SlaRow>();

    let { data, error } = await query('weekly_reminder, weekly_reminder_interval_days, target_rate');
    if (error) {
      // The interval column only exists once its migration is applied. Reading without it keeps a backend that was
      // deployed before the migration working (the interval then stays at its default of 7).
      ({ data, error } = await query('weekly_reminder, target_rate'));
    }
    if (error || !data) {
      this.logger.warn(`Could not read the APE SLA settings (${error?.message ?? 'no active APE row'}); using the defaults.`);
      return DEFAULT_APE_SLA_SETTINGS;
    }
    return parseApeSlaSettings(data);
  }
}
