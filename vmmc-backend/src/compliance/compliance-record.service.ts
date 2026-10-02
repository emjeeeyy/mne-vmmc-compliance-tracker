import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EmployeeContext } from '../auth/types/role';
import { computeCycleDates } from './sla-evaluator';
import { DossierResponse, TrackerEntry } from './types';

interface EmployeeRow {
  id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  email: string;
  phone: string | null;
  department_id: string;
  departments: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
  compliance_records: ComplianceRecordRow[];
}

interface ComplianceRecordRow {
  cycle_year: number;
  status: TrackerEntry['status'];
  clinical_status: TrackerEntry['clinicalStatus'];
  due_date: string;
  window_open_date: string;
  birthday_date: string;
  approved_document_id: string | null;
}

interface ApprovedDocumentRow {
  id: string;
  cxr_result: TrackerEntry['cxrResult'];
  genexpert_result: TrackerEntry['genexpertResult'];
  exam_date: string | null;
}

function firstDept(dept: EmployeeRow['departments']) {
  return Array.isArray(dept) ? dept[0] : dept;
}

const RECORD_SELECT =
  'cycle_year, status, clinical_status, due_date, window_open_date, birthday_date, approved_document_id';

@Injectable()
export class ComplianceRecordService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // This was previously re-checked (SLA lookup + full active-employee fetch + upsert) on every
  // single tracker/dossier read, which measurably slowed those endpoints down for no benefit —
  // employees in this app are only ever added via seed scripts followed by a server restart
  // (there's no runtime "create employee" endpoint), so once a cycle year has been provisioned
  // in this process's lifetime, re-checking it again is pure overhead. Cached per cycle year.
  private readonly ensuredCycleYears = new Set<number>();

  /** Idempotent: creates this cycle's compliance_records row for every active employee under
   * the APE SLA, but never touches status/clinical_status on a row that already exists. */
  async ensureCurrentCycleRecords(cycleYear = new Date().getUTCFullYear()) {
    if (this.ensuredCycleYears.has(cycleYear)) return;
    const client = this.supabaseService.getClient();

    const { data: apeSla } = await client
      .from('sla_definitions')
      .select('id, first_reminder_days_before_birthday')
      .eq('tracking_type', 'APE')
      .eq('active', true)
      .maybeSingle();
    if (!apeSla) return;

    const { data: employees } = await client
      .from('employees')
      .select('id, birth_date')
      .eq('employment_status', 'ACTIVE');
    if (!employees || employees.length === 0) return;

    const rows = employees.map((employee) => {
      const dates = computeCycleDates(
        new Date(employee.birth_date),
        cycleYear,
        apeSla.first_reminder_days_before_birthday,
      );
      return {
        employee_id: employee.id,
        sla_definition_id: apeSla.id,
        cycle_year: cycleYear,
        birthday_date: dates.birthdayDate,
        window_open_date: dates.windowOpenDate,
        due_date: dates.dueDate,
      };
    });

    await client
      .from('compliance_records')
      .upsert(rows, { onConflict: 'employee_id,sla_definition_id,cycle_year', ignoreDuplicates: true });

    this.ensuredCycleYears.add(cycleYear);
  }

  /** The current cycle's compliance_records row id for an employee — documents link to this. */
  async getCurrentCycleRecordId(employeeId: string, cycleYear = new Date().getUTCFullYear()): Promise<string | null> {
    await this.ensureCurrentCycleRecords(cycleYear);
    const { data } = await this.supabaseService
      .getClient()
      .from('compliance_records')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('cycle_year', cycleYear)
      .maybeSingle();
    return data?.id ?? null;
  }

  async getTracker(currentUser: EmployeeContext, search?: string, department?: string): Promise<TrackerEntry[]> {
    await this.ensureCurrentCycleRecords();
    const cycleYear = new Date().getUTCFullYear();
    const client = this.supabaseService.getClient();

    let query = client
      .from('employees')
      .select(
        `id, employee_id, full_name, job_title, email, phone, department_id,
         departments!employees_department_id_fkey ( id, name, code ),
         compliance_records!inner ( ${RECORD_SELECT} )`,
      )
      .eq('employment_status', 'ACTIVE')
      .eq('compliance_records.cycle_year', cycleYear)
      .order('full_name');

    if (currentUser.role === 'UNIT_HEAD') {
      query = query.eq('department_id', currentUser.departmentId);
    } else if (department && department !== 'All Departments') {
      // Resolve the code to an id and filter on the plain employees.department_id column —
      // filtering the embedded departments resource directly needs the FK hint repeated
      // and is fragile; this side-steps that entirely.
      const { data: dept } = await client.from('departments').select('id').eq('code', department).maybeSingle();
      query = query.eq('department_id', dept?.id ?? '00000000-0000-0000-0000-000000000000');
    }

    if (search) {
      const escaped = search.replace(/[%,]/g, '');
      query = query.or(`full_name.ilike.%${escaped}%,employee_id.ilike.%${escaped}%`);
    }

    const { data, error } = await query.returns<EmployeeRow[]>();
    if (error) throw error;

    const documentsById = await this.fetchApprovedDocuments(data ?? []);
    return (data ?? []).map((row) => this.toTrackerEntry(row, documentsById));
  }

  async getDossier(currentUser: EmployeeContext, employeeId: string): Promise<DossierResponse> {
    await this.ensureCurrentCycleRecords();
    const cycleYear = new Date().getUTCFullYear();
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('employees')
      .select(
        `id, employee_id, full_name, job_title, email, phone, department_id,
         departments!employees_department_id_fkey ( id, name, code ),
         compliance_records!inner ( ${RECORD_SELECT} )`,
      )
      .eq('id', employeeId)
      .eq('compliance_records.cycle_year', cycleYear)
      .maybeSingle<EmployeeRow>();
    if (error) throw error;
    if (!data) throw new NotFoundException('Employee not found.');

    this.assertDossierAccess(currentUser, data.department_id, data.id);

    const documentsById = await this.fetchApprovedDocuments([data]);
    const entry = this.toTrackerEntry(data, documentsById);
    const record = data.compliance_records[0];

    return {
      ...entry,
      id: data.id,
      email: data.email,
      phone: data.phone,
      cycleYear: record.cycle_year,
      windowOpenDate: record.window_open_date,
      birthdayDate: record.birthday_date,
      documents: [],
    };
  }

  private async fetchApprovedDocuments(rows: EmployeeRow[]): Promise<Map<string, ApprovedDocumentRow>> {
    const ids = rows
      .map((row) => row.compliance_records[0]?.approved_document_id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return new Map();

    const { data } = await this.supabaseService
      .getClient()
      .from('documents')
      .select('id, cxr_result, genexpert_result, exam_date')
      .in('id', ids)
      .returns<ApprovedDocumentRow[]>();

    return new Map((data ?? []).map((doc) => [doc.id, doc]));
  }

  private assertDossierAccess(currentUser: EmployeeContext, targetDepartmentId: string, targetEmployeeId: string) {
    if (currentUser.role === 'ADMIN') return;
    if (currentUser.role === 'UNIT_HEAD' && currentUser.departmentId === targetDepartmentId) return;
    if (currentUser.role === 'STAFF' && currentUser.id === targetEmployeeId) return;
    throw new ForbiddenException('You do not have permission to view this record.');
  }

  private toTrackerEntry(row: EmployeeRow, documentsById: Map<string, ApprovedDocumentRow>): TrackerEntry {
    const dept = firstDept(row.departments);
    const record = row.compliance_records[0];
    const approvedDoc = record.approved_document_id ? documentsById.get(record.approved_document_id) : undefined;

    return {
      employeeId: row.employee_id,
      fullName: row.full_name,
      jobTitle: row.job_title,
      department: dept,
      status: record.status,
      clinicalStatus: record.clinical_status,
      dueDate: record.due_date,
      cxrResult: approvedDoc?.cxr_result ?? 'NOT_APPLICABLE',
      genexpertResult: approvedDoc?.genexpert_result ?? 'NOT_APPLICABLE',
      examDate: approvedDoc?.exam_date ?? null,
    };
  }
}
