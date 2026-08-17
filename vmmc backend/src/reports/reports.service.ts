import { ForbiddenException, Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { BiologicalMatrixRow, ClearanceSummaryRow, DelinquencyRow } from './types';

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

@Injectable()
export class ReportsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getDelinquencyLog(currentUser: EmployeeContext, department?: string): Promise<DelinquencyRow[]> {
    const departmentId = await this.resolveScopedDepartmentId(currentUser, department);
    const client = this.supabaseService.getClient();
    const cycleYear = new Date().getUTCFullYear();

    let employeeQuery = client
      .from('employees')
      .select('id, employee_id, full_name, departments!employees_department_id_fkey(name)')
      .eq('employment_status', 'ACTIVE');
    if (departmentId) employeeQuery = employeeQuery.eq('department_id', departmentId);
    const { data: employees } = await employeeQuery;
    if (!employees || employees.length === 0) return [];

    const employeeIds = employees.map((e) => e.id);
    const { data: records, error } = await client
      .from('compliance_records')
      .select('employee_id, status, due_date')
      .eq('cycle_year', cycleYear)
      .in('employee_id', employeeIds)
      .in('status', ['NON_COMPLIANT', 'OVERDUE']);
    if (error) throw error;

    const today = new Date();
    const employeesById = new Map(employees.map((e) => [e.id, e]));

    return (records ?? []).map((r) => {
      const employee = employeesById.get(r.employee_id);
      const dept = Array.isArray(employee?.departments) ? employee?.departments[0] : employee?.departments;
      return {
        employeeId: employee?.employee_id ?? '',
        fullName: employee?.full_name ?? '',
        department: dept?.name ?? '',
        status: r.status as DelinquencyRow['status'],
        dueDate: r.due_date,
        daysOverdue: Math.max(0, daysBetween(today, new Date(r.due_date))),
      };
    });
  }

  async getClearanceSummary(currentUser: EmployeeContext, department?: string): Promise<ClearanceSummaryRow[]> {
    const departmentId = await this.resolveScopedDepartmentId(currentUser, department);
    const client = this.supabaseService.getClient();
    const cycleYear = new Date().getUTCFullYear();

    let deptQuery = client.from('departments').select('id, name, code');
    if (departmentId) deptQuery = deptQuery.eq('id', departmentId);
    const { data: departments } = await deptQuery;
    if (!departments || departments.length === 0) return [];

    const rows: ClearanceSummaryRow[] = [];
    for (const dept of departments) {
      const { data: employees } = await client
        .from('employees')
        .select('id')
        .eq('department_id', dept.id)
        .eq('employment_status', 'ACTIVE');
      const employeeIds = (employees ?? []).map((e) => e.id);
      if (employeeIds.length === 0) {
        rows.push({
          department: dept.name,
          departmentCode: dept.code,
          totalEmployees: 0,
          compliant: 0,
          pending: 0,
          nonCompliant: 0,
          overdue: 0,
          complianceRate: 0,
        });
        continue;
      }

      const { data: records } = await client
        .from('compliance_records')
        .select('status')
        .eq('cycle_year', cycleYear)
        .in('employee_id', employeeIds);

      const compliant = (records ?? []).filter((r) => r.status === 'COMPLIANT').length;
      const pending = (records ?? []).filter((r) => r.status === 'PENDING').length;
      const nonCompliant = (records ?? []).filter((r) => r.status === 'NON_COMPLIANT').length;
      const overdue = (records ?? []).filter((r) => r.status === 'OVERDUE').length;
      const total = records?.length ?? 0;

      rows.push({
        department: dept.name,
        departmentCode: dept.code,
        totalEmployees: total,
        compliant,
        pending,
        nonCompliant,
        overdue,
        complianceRate: total > 0 ? Math.round((compliant / total) * 100) : 0,
      });
    }
    return rows;
  }

  async getBiologicalMatrix(currentUser: EmployeeContext, department?: string): Promise<BiologicalMatrixRow[]> {
    const departmentId = await this.resolveScopedDepartmentId(currentUser, department);
    const client = this.supabaseService.getClient();

    let employeeQuery = client
      .from('employees')
      .select('id, employee_id, full_name, departments!employees_department_id_fkey(name)')
      .eq('employment_status', 'ACTIVE');
    if (departmentId) employeeQuery = employeeQuery.eq('department_id', departmentId);
    const { data: employees } = await employeeQuery;
    if (!employees || employees.length === 0) return [];

    const employeeIds = employees.map((e) => e.id);
    const { data: logs, error } = await client
      .from('pep_logs')
      .select('employee_id, exposure_date, exposure_type, prophylaxis_status, follow_up_date, notes')
      .in('employee_id', employeeIds)
      .order('exposure_date', { ascending: false });
    if (error) throw error;

    const employeesById = new Map(employees.map((e) => [e.id, e]));
    return (logs ?? []).map((log) => {
      const employee = employeesById.get(log.employee_id);
      const dept = Array.isArray(employee?.departments) ? employee?.departments[0] : employee?.departments;
      return {
        employeeId: employee?.employee_id ?? '',
        fullName: employee?.full_name ?? '',
        department: dept?.name ?? '',
        exposureDate: log.exposure_date,
        exposureType: log.exposure_type,
        prophylaxisStatus: log.prophylaxis_status,
        followUpDate: log.follow_up_date,
        notes: log.notes,
      };
    });
  }

  /** Same access model as the Compliance Tracker: UNIT_HEAD is forced to their own department
   * regardless of what's requested; ADMIN may pass any department code or omit it for all;
   * STAFF has no business viewing cross-employee report rows. */
  private async resolveScopedDepartmentId(currentUser: EmployeeContext, department?: string): Promise<string | undefined> {
    if (currentUser.role === 'STAFF') {
      throw new ForbiddenException('You do not have permission to view reports.');
    }
    if (currentUser.role === 'UNIT_HEAD') {
      return currentUser.departmentId;
    }
    if (!department || department === 'All Departments') return undefined;

    const { data: dept } = await this.supabaseService
      .getClient()
      .from('departments')
      .select('id')
      .eq('code', department)
      .maybeSingle();
    return dept?.id ?? '00000000-0000-0000-0000-000000000000';
  }
}
