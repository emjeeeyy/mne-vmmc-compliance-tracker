import { Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { AdminOverview, MonthlyPoint, StaffOverview } from './types';

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

    // Independent of each other — run in parallel rather than paying two round trips in sequence.
    const [{ data: department }, deptRecords] = await Promise.all([
      client.from('departments').select('name, code').eq('id', currentUser.departmentId).maybeSingle(),
      this.fetchRecords(cycleYear, currentUser.departmentId),
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
          triggerLabel: `TRIGGERED BY BIRTHDAY: ${this.formatDate(own.birthday_date)}`,
        }
      : null;

    const pendingActions =
      own?.status === 'COMPLIANT'
        ? 'No pending actions — clearance is up to date.'
        : 'Complete Chest X-Ray screening';

    const monthlyTrend = this.buildMonthlyTrend(cycleYear, deptRecords);

    return {
      role: 'staff',
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
      monthlyTrend,
    };
  }

  private async getAdminOverview(): Promise<AdminOverview> {
    const cycleYear = new Date().getUTCFullYear();
    const client = this.supabaseService.getClient();

    const [records, { count: totalPersonnel }] = await Promise.all([
      this.fetchRecords(cycleYear),
      client.from('employees').select('id', { count: 'exact', head: true }).eq('employment_status', 'ACTIVE'),
    ]);
    const compliant = records.filter((r) => r.status === 'COMPLIANT').length;
    const rate = records.length > 0 ? Math.round((compliant / records.length) * 100) : 0;
    const criticalCases = records.filter((r) => r.clinical_status === 'CRITICAL').length;

    const monthlyBreakdown = this.buildMonthlyTrend(cycleYear, records);
    const trendDelta =
      monthlyBreakdown.length >= 2
        ? monthlyBreakdown[monthlyBreakdown.length - 1].value - monthlyBreakdown[monthlyBreakdown.length - 2].value
        : 0;

    return {
      role: 'admin',
      hospitalCompliance: { rate, trendDelta },
      totalPersonnel: totalPersonnel ?? 0,
      criticalCases,
      annualClearanceProgress: { rate, monthlyBreakdown },
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

  private formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  }
}
