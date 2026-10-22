import { Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { AdminOverview, ClearanceBucket, DepartmentClearance, FollowUpEntry, MonthlyPoint, ScreeningChecklistItem, ScreeningProgress, StaffOverview } from './types';

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface RecordRow {
  status: string;
  clinical_status: string;
  cleared_at: string | null;
  due_date: string;
  birthday_date: string;
  window_open_date: string;
  employee_id: string;
}

function endOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));
}

export const DUE_SOON_DAYS = 15;
export const FOLLOW_UP_LIMIT = 10;

export function clearanceBucket(record: { status: string; due_date: string }, today: string): ClearanceBucket {
  if (record.status === 'COMPLIANT') return 'UP_TO_DATE';
  if (record.status === 'OVERDUE' || record.due_date < today) return 'OVERDUE';
  const daysLeft = (Date.parse(record.due_date) - Date.parse(today)) / 86_400_000;
  return daysLeft <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UP_TO_DATE';
}

export interface AdminEmployeeRow {
  id: string;
  employee_id: string;
  full_name: string;
  departments: { name: string; code: string } | { name: string; code: string }[] | null;
}

/** Charts and follow-up list for the admin landing page, from already-fetched rows. Pure (no DB access)
 * so the bucketing and ordering are tested directly, like buildScreeningProgress. */
export function buildAdminBreakdown(
  records: { id: string; employee_id: string; status: string; due_date: string }[],
  employees: AdminEmployeeRow[],
  today: string = new Date().toISOString().slice(0, 10),
): { clearanceCounts: AdminOverview['clearanceCounts']; departmentClearance: DepartmentClearance[]; followUps: Omit<FollowUpEntry, 'lastReminderAt'>[]; followUpTotal: number } {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const departments = new Map<string, DepartmentClearance>();
  const counts = { upToDate: 0, dueSoon: 0, overdue: 0 };
  const overdue: Omit<FollowUpEntry, 'lastReminderAt'>[] = [];

  for (const record of records) {
    const employee = byId.get(record.employee_id);
    if (!employee) continue;
    const dept = (Array.isArray(employee.departments) ? employee.departments[0] : employee.departments) ?? { name: 'Unassigned', code: '—' };
    const row = departments.get(dept.code) ?? { name: dept.name, code: dept.code, upToDate: 0, dueSoon: 0, overdue: 0 };
    const bucket = clearanceBucket(record, today);
    if (bucket === 'OVERDUE') {
      row.overdue++;
      counts.overdue++;
      overdue.push({ recordId: record.id, employeeId: employee.employee_id, fullName: employee.full_name, department: dept.name, module: 'APE Exam', dueDate: record.due_date });
    } else if (bucket === 'DUE_SOON') {
      row.dueSoon++;
      counts.dueSoon++;
    } else {
      row.upToDate++;
      counts.upToDate++;
    }
    departments.set(dept.code, row);
  }

  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const departmentClearance = [...departments.values()].sort(
    (a, b) => b.upToDate + b.dueSoon + b.overdue - (a.upToDate + a.dueSoon + a.overdue) || a.name.localeCompare(b.name),
  );
  return { clearanceCounts: counts, departmentClearance, followUps: overdue.slice(0, FOLLOW_UP_LIMIT), followUpTotal: overdue.length };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** The 3 screening categories this system actually tracks for an individual STAFF member —
 * deliberately fixed at 3, never padded to match a design mockup's literal count. Immunizations
 * stays admin-entered-only here (no self-submit flow yet): this just reads whatever's already
 * on file, the same way the rest of this dashboard reads compliance_records/documents.
 * A pure function (no DB access) so it's directly unit-testable, same pattern as
 * `sla-evaluator.ts`'s `computeCycleDates` — exhaustively tested without mocking Supabase at all. */
export function buildScreeningProgress(
  own: Pick<RecordRow, 'status' | 'due_date'> | null,
  latestTiter: { review_status: string } | null,
  latestImmunization: { vaccine_type: string; quarter: string | null; next_due_date: string | null } | null,
  today: string = new Date().toISOString().slice(0, 10),
): ScreeningProgress {
  const apeItem: ScreeningChecklistItem = own
    ? own.status === 'COMPLIANT'
      ? { key: 'APE', label: 'APE Chest X-Ray', status: 'VERIFIED', detail: null }
      : { key: 'APE', label: 'APE Chest X-Ray', status: 'DUE', detail: `Due ${formatDate(own.due_date)}` }
    : { key: 'APE', label: 'APE Chest X-Ray', status: 'MISSING', detail: 'Not yet started' };

  const titerItem: ScreeningChecklistItem = !latestTiter
    ? { key: 'HEPB_TITER', label: 'Hep B Titers', status: 'MISSING', detail: 'Not yet submitted' }
    : latestTiter.review_status === 'APPROVED'
      ? { key: 'HEPB_TITER', label: 'Hep B Titers', status: 'VERIFIED', detail: null }
      : { key: 'HEPB_TITER', label: 'Hep B Titers', status: 'DUE', detail: 'Pending review' };

  const immunizationLabel = latestImmunization
    ? `${latestImmunization.quarter ?? ''} ${latestImmunization.vaccine_type} Immunization`.trim()
    : 'Immunization';
  const immunizationItem: ScreeningChecklistItem = !latestImmunization
    ? { key: 'IMMUNIZATION', label: immunizationLabel, status: 'MISSING', detail: 'None on file' }
    : latestImmunization.next_due_date && latestImmunization.next_due_date < today
      ? { key: 'IMMUNIZATION', label: immunizationLabel, status: 'DUE', detail: `Due ${formatDate(latestImmunization.next_due_date)}` }
      : { key: 'IMMUNIZATION', label: immunizationLabel, status: 'VERIFIED', detail: null };

  const items = [apeItem, titerItem, immunizationItem];
  const verifiedCount = items.filter((i) => i.status === 'VERIFIED').length;
  const total = 3;

  return { verifiedCount, total, percent: Math.round((verifiedCount / total) * 100), items };
}

@Injectable()
export class DashboardService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getOverview(currentUser: EmployeeContext): Promise<StaffOverview | AdminOverview> {
    return currentUser.role === 'ADMIN' ? this.getAdminOverview() : this.getStaffOverview(currentUser);
  }

  async getTrend(currentUser: EmployeeContext, scope: 'dept' | 'hospital'): Promise<MonthlyPoint[]> {
    const cycleYear = new Date().getUTCFullYear();
    const departmentId = scope === 'dept' ? currentUser.departmentId : undefined;
    return this.computeMonthlyTrend(cycleYear, departmentId);
  }

  private async getStaffOverview(currentUser: EmployeeContext): Promise<StaffOverview> {
    const client = this.supabaseService.getClient();
    const cycleYear = new Date().getUTCFullYear();

    // Independent of each other — run in parallel rather than paying round trips in sequence.
    const [
      { data: department },
      deptRecords,
      { count: totalPersonnel },
      { data: latestTiter },
      { data: latestImmunization },
      { data: lastAudited },
    ] = await Promise.all([
      client.from('departments').select('name, code').eq('id', currentUser.departmentId).maybeSingle(),
      this.fetchRecords(cycleYear, currentUser.departmentId),
      client.from('employees').select('id', { count: 'exact', head: true }).eq('employment_status', 'ACTIVE'),
      client
        .from('documents')
        .select('review_status')
        .eq('employee_id', currentUser.id)
        .eq('doc_type', 'HEPB_TITER')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('immunizations')
        .select('vaccine_type, quarter, next_due_date')
        .eq('employee_id', currentUser.id)
        .order('administered_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('documents')
        .select('reviewed_at')
        .eq('employee_id', currentUser.id)
        .not('reviewed_at', 'is', null)
        .order('reviewed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const registryCompliance = deptRecords.filter((r) => r.status === 'COMPLIANT').length;
    const pendingStaffCount = deptRecords.filter((r) => r.status === 'PENDING' || r.status === 'NON_COMPLIANT').length;
    const urgentActiveActions = deptRecords.filter((r) => r.status === 'OVERDUE' || r.clinical_status === 'CRITICAL').length;
    const complianceRate = deptRecords.length > 0 ? Math.round((registryCompliance / deptRecords.length) * 100) : 0;

    // Filtering embedded-relation columns directly is fragile (see ComplianceRecordService) —
    // resolve the department's employee ids first, then filter documents on the plain column.
    const deptEmployeeIds = deptRecords.map((r) => r.employee_id);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: reportsVerifiedToday } = deptEmployeeIds.length
      ? await client
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .in('employee_id', deptEmployeeIds)
          .in('review_status', ['APPROVED', 'REJECTED'])
          .gte('reviewed_at', todayStart.toISOString())
      : { count: 0 };

    const own = deptRecords.find((r) => r.employee_id === currentUser.id) ?? null;
    const nextDue = own
      ? {
          date: own.due_date,
          progressPercent: this.computeProgressPercent(own),
          triggerLabel: `TRIGGERED BY BIRTHDAY: ${formatDate(own.birthday_date)}`,
        }
      : null;

    const pendingActions =
      own?.status === 'COMPLIANT'
        ? 'No pending actions — clearance is up to date.'
        : 'Complete Chest X-Ray screening';

    const monthlyTrend = this.buildMonthlyTrend(cycleYear, deptRecords);
    const screeningProgress = buildScreeningProgress(own, latestTiter, latestImmunization);

    return {
      role: 'staff',
      employeeId: currentUser.employeeId,
      totalPersonnel: totalPersonnel ?? 0,
      lastAuditedAt: lastAudited?.reviewed_at ?? null,
      nextDue,
      department: {
        name: department?.name ?? 'Unassigned',
        code: department?.code ?? '',
        complianceRate,
        pendingStaffCount,
      },
      urgentActiveActions,
      registryCompliance,
      reportsVerifiedToday: reportsVerifiedToday ?? 0,
      pendingActions,
      screeningProgress,
      monthlyTrend,
    };
  }

  private async getAdminOverview(): Promise<AdminOverview> {
    const cycleYear = new Date().getUTCFullYear();
    const client = this.supabaseService.getClient();

    const [{ data: employeeRows }, { data: recordRows, error }, { data: previousRows }] = await Promise.all([
      client
        .from('employees')
        .select('id, employee_id, full_name, departments!employees_department_id_fkey ( name, code )')
        .eq('employment_status', 'ACTIVE')
        .returns<AdminEmployeeRow[]>(),
      client
        .from('compliance_records')
        .select('id, status, clinical_status, cleared_at, due_date, birthday_date, window_open_date, employee_id')
        .eq('cycle_year', cycleYear)
        .returns<(RecordRow & { id: string })[]>(),
      client.from('compliance_records').select('status, employee_id').eq('cycle_year', cycleYear - 1).returns<{ status: string; employee_id: string }[]>(),
    ]);
    if (error) throw error;
    const employees = employeeRows ?? [];
    const activeIds = new Set(employees.map((e) => e.id));
    // Same scope as before: only active employees' records count toward any figure on this page.
    const records = (recordRows ?? []).filter((r) => activeIds.has(r.employee_id));
    const previous = (previousRows ?? []).filter((r) => activeIds.has(r.employee_id));
    const totalPersonnel = employees.length;
    const compliant = records.filter((r) => r.status === 'COMPLIANT').length;
    const rate = records.length > 0 ? Math.round((compliant / records.length) * 100) : 0;
    const criticalCases = records.filter((r) => r.clinical_status === 'CRITICAL').length;

    const monthlyBreakdown = this.buildMonthlyTrend(cycleYear, records);
    const trendDelta =
      monthlyBreakdown.length >= 2
        ? monthlyBreakdown[monthlyBreakdown.length - 1].value - monthlyBreakdown[monthlyBreakdown.length - 2].value
        : 0;

    const breakdown = buildAdminBreakdown(records, employees);
    const previousCycleRate =
      previous.length > 0 ? Math.round((previous.filter((r) => r.status === 'COMPLIANT').length / previous.length) * 100) : null;

    // Last manual reminder per listed person, so the table can show "Sent" after a reload too.
    const lastReminder = new Map<string, string>();
    if (breakdown.followUps.length > 0) {
      const { data: reminders } = await client
        .from('events')
        .select('compliance_record_id, detected_at')
        .eq('event_subtype', 'MANUAL_REMINDER')
        .in('compliance_record_id', breakdown.followUps.map((f) => f.recordId))
        .order('detected_at', { ascending: false });
      for (const r of reminders ?? []) {
        if (!lastReminder.has(r.compliance_record_id)) lastReminder.set(r.compliance_record_id, r.detected_at);
      }
    }

    return {
      role: 'admin',
      hospitalCompliance: { rate, trendDelta },
      totalPersonnel,
      criticalCases,
      annualClearanceProgress: { rate, monthlyBreakdown },
      trackedPercent: totalPersonnel > 0 ? Math.round((records.length / totalPersonnel) * 100) : 0,
      previousCycleRate,
      clearanceCounts: breakdown.clearanceCounts,
      departmentClearance: breakdown.departmentClearance,
      followUps: breakdown.followUps.map((f) => ({ ...f, lastReminderAt: lastReminder.get(f.recordId) ?? null })),
      followUpTotal: breakdown.followUpTotal,
    };
  }

  /** Used only by the standalone GET /dashboard/trend endpoint, which has no already-fetched
   * records to reuse. getStaffOverview/getAdminOverview call buildMonthlyTrend directly instead,
   * since they've already fetched the same records for their own stats — fetching twice per
   * request was the main cause of /dashboard/overview's slow response time. */
  private async computeMonthlyTrend(cycleYear: number, departmentId?: string): Promise<MonthlyPoint[]> {
    const records = await this.fetchRecords(cycleYear, departmentId);
    return this.buildMonthlyTrend(cycleYear, records);
  }

  /** Cumulative "% of this cycle's records that are COMPLIANT as of month-end", Jan → current month. */
  private buildMonthlyTrend(cycleYear: number, records: RecordRow[]): MonthlyPoint[] {
    const total = records.length;
    const now = new Date();
    const lastMonthIndex = now.getUTCFullYear() === cycleYear ? now.getUTCMonth() : 11;

    const points: MonthlyPoint[] = [];
    for (let month = 0; month <= lastMonthIndex; month++) {
      const cutoff = endOfMonth(cycleYear, month);
      const clearedByThen = records.filter((r) => r.cleared_at && new Date(r.cleared_at) <= cutoff).length;
      points.push({ label: MONTH_LABELS[month], value: total > 0 ? Math.round((clearedByThen / total) * 100) : 0 });
    }
    return points;
  }

  /** Resolves active employee ids first, then filters compliance_records on the plain
   * employee_id column — filtering an embedded relation's columns directly is fragile
   * (see ComplianceRecordService), so this side-steps that entirely. */
  private async fetchRecords(cycleYear: number, departmentId?: string): Promise<RecordRow[]> {
    const client = this.supabaseService.getClient();

    let employeeQuery = client.from('employees').select('id').eq('employment_status', 'ACTIVE');
    if (departmentId) {
      employeeQuery = employeeQuery.eq('department_id', departmentId);
    }
    const { data: employees } = await employeeQuery;
    const employeeIds = (employees ?? []).map((e) => e.id);
    if (employeeIds.length === 0) return [];

    const { data, error } = await client
      .from('compliance_records')
      .select('status, clinical_status, cleared_at, due_date, birthday_date, window_open_date, employee_id')
      .eq('cycle_year', cycleYear)
      .in('employee_id', employeeIds)
      .returns<RecordRow[]>();
    if (error) throw error;
    return data ?? [];
  }

  private computeProgressPercent(record: RecordRow): number {
    if (record.status === 'COMPLIANT') return 100;
    const windowOpen = new Date(record.window_open_date).getTime();
    const due = new Date(record.due_date).getTime();
    const now = Date.now();
    if (due <= windowOpen) return 0;
    const percent = ((now - windowOpen) / (due - windowOpen)) * 100;
    return Math.max(0, Math.min(100, Math.round(percent)));
  }

}
