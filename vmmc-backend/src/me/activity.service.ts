import { Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { describeUserAgent } from '../common/describe-user-agent';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuditLogRow {
  action: string;
  entity_type: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

const ENTITY_LABELS: Record<string, string> = {
  auth: 'Account',
  compliance: 'Health Registry Tracker',
  dashboard: 'Home Dashboard',
  documents: 'Laboratory Documents',
  'review-queue': 'Review Queue',
  escalations: 'Escalations',
  reports: 'Compliance Reports',
  'pep-logs': 'PEP Exposure Log',
  immunizations: 'Immunization Record',
  'pre-employment': 'Pre-Employment Screening',
  'change-requests': 'Change Request',
  monitoring: 'Compliance Scan',
  me: 'Profile', // fallback for a bare /me request with no sub-resource segment (shouldn't occur in practice)
  'me-profile': 'Profile',
  'me-compliance-summary': 'My Compliance Record',
  'me-documents': 'My Documents',
  'me-notifications': 'Notifications',
  'me-signature': 'Digital Signature',
  'me-security': 'Account Security',
  'me-privacy-settings': 'Data Privacy Settings',
  'me-performance-stats': 'Performance Stats',
  'me-activity-logs': 'Activity Logs',
  'me-login-history': 'Login History',
  'me-devices': 'Registered Devices',
};

function describe(action: string, entityType: string | null): string {
  const label = (entityType && ENTITY_LABELS[entityType]) || 'Record';
  if (action === 'LOGIN') return 'Secure Login Successful';
  if (action === 'LOGIN_FAILED') return 'Failed Login Attempt';
  if (action === 'ACCESS_DENIED') return `Blocked Access Attempt: ${label}`;
  if (action === 'ACCESS') return `Accessed ${label}`;
  if (action === 'CREATE') return `Created ${label} Entry`;
  if (action === 'UPDATE') return `Updated ${label}`;
  if (action === 'DELETE') return `Deleted ${label} Entry`;
  return `${action} — ${label}`;
}

/**
 * These entity types are real audit_logs rows (kept, untouched, for anyone who needs
 * the full access trail) but their *ACCESS* (read) rows aren't real activity from the
 * user's own point of view — they're background reads the UI fires on its own to
 * populate a page, not something the user deliberately did:
 *  - `me-notifications` fires from Layout.tsx's notification bell on literally every
 *    page load across the whole app, not just when someone opens Notifications.
 *  - `me-activity-logs`, `me-login-history`, `me-devices`, `me-privacy-settings`,
 *    `change-requests` all fire together in one burst the instant Profile.tsx mounts,
 *    to populate its own side panels — not several separate things the user did, just
 *    one page opening. (`change-requests` specifically: `refreshMyChangeRequests()` is
 *    called unconditionally on mount to populate the "Request a Change" history list —
 *    reported live by a user who'd never touched that panel and saw "Accessed Change
 *    Request" show up anyway.)
 *  - `departments` fires from Compliance.tsx on every visit, just to populate a
 *    department-filter dropdown — same shape of problem, different page.
 * Left in the feed, these show up as a wall of near-identical "Accessed X" entries
 * that all share the same timestamp (the moment the page loaded), which reads as
 * inaccurate/noisy rather than a real activity trail.
 *
 * Only the `ACCESS` action is suppressed for these — never `CREATE`/`UPDATE`/`DELETE`.
 * Nothing in this app ever mutates on its own; every write is the direct result of a
 * user clicking something (removing a device, toggling a privacy setting, submitting
 * or approving a change request), so those stay real activity regardless of entity
 * type. An earlier version of this filter excluded the whole entity type regardless
 * of action, which silently hid genuine actions like "removed a device" — fixed here.
 * Excluding rows here only changes what the user-facing feed shows — nothing is
 * removed from `audit_logs` itself.
 */
const NOISE_ACCESS_ENTITY_TYPES = new Set([
  'me-notifications',
  'me-activity-logs',
  'me-login-history',
  'me-devices',
  'me-privacy-settings',
  'change-requests',
  'departments',
]);

export function isNoise(row: AuditLogRow): boolean {
  return row.action === 'ACCESS' && NOISE_ACCESS_ENTITY_TYPES.has(row.entity_type ?? '');
}

const BURST_WINDOW_MS = 3000;

/**
 * A GET is safe and idempotent by HTTP's own definition — it's *supposed* to be
 * repeatable without consequence. React 18 Strict Mode double-invokes effects in
 * dev, a tab refocus can re-trigger a fetch, a slow network can cause a retry —
 * none of that is the user doing the same thing two or three times, it's normal
 * request plumbing firing the same safe read more than once. Treating every one
 * of those as its own distinct "activity" is what actually made the feed read as
 * inconsistent: the same page visit showing up as 2, 3, or 4 near-identical rows
 * depending on timing, instead of the one real thing that happened. Collapses
 * consecutive same-(action, entity_type) rows that land within `BURST_WINDOW_MS`
 * of each other into one, keeping the most recent in each burst. Two visits to
 * the same page minutes apart are both real and both kept — only true bursts
 * (everything in practice lands well under 1s) get merged. `rows` must already
 * be ordered newest-first.
 */
export function dedupeBursts(rows: AuditLogRow[]): AuditLogRow[] {
  const result: AuditLogRow[] = [];
  const lastSeenTime = new Map<string, number>(); // last row of this signature seen so far, kept or not

  for (const row of rows) {
    const signature = `${row.action}:${row.entity_type ?? ''}`;
    const time = new Date(row.timestamp).getTime();
    const last = lastSeenTime.get(signature);
    const isBurstDupe = last !== undefined && last - time < BURST_WINDOW_MS;
    lastSeenTime.set(signature, time); // anchor the window to this row regardless, so a slow-drifting burst stays merged
    if (isBurstDupe) continue;
    result.push(row);
  }

  return result;
}

@Injectable()
export class ActivityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listActivityLogs(currentUser: EmployeeContext) {
    // Overfetch past the noise/burst filtering below, since both shrink the result —
    // fetching exactly 30 upfront could leave far fewer than 30 genuinely meaningful,
    // distinct entries (or none, right after a Profile-heavy session).
    const { data, error } = await this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('action, entity_type, ip_address, user_agent, timestamp')
      .eq('actor_id', currentUser.id)
      .order('timestamp', { ascending: false })
      .limit(90)
      .returns<AuditLogRow[]>();
    if (error) throw error;

    const filtered = (data ?? []).filter((row) => !isNoise(row));
    return dedupeBursts(filtered)
      .slice(0, 30)
      .map((row) => ({
        title: describe(row.action, row.entity_type),
        time: row.timestamp,
        ip: row.ip_address,
      }));
  }

  async listLoginHistory(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('action, entity_type, ip_address, user_agent, timestamp')
      .eq('actor_id', currentUser.id)
      .eq('action', 'LOGIN')
      .order('timestamp', { ascending: false })
      .limit(20)
      .returns<AuditLogRow[]>();
    if (error) throw error;

    return (data ?? []).map((row, index) => ({
      device: describeUserAgent(row.user_agent),
      ip: row.ip_address,
      time: row.timestamp,
      current: index === 0,
    }));
  }
}
