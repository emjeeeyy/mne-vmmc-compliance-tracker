import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';
import { ChangeRequestRow, EditableField } from './types';

/** job_title/birth_date/employment_status map straight onto an employees column;
 * department_code is handled separately in both directions since the stored value
 * (a department_id) and the human-facing one (its code) aren't the same string. */
const DIRECT_COLUMN: Partial<Record<EditableField, string>> = {
  job_title: 'job_title',
  birth_date: 'birth_date',
  employment_status: 'employment_status',
};

interface ReviewerInfo {
  employee_id: string;
  full_name: string;
  job_title: string | null;
}

@Injectable()
export class ChangeRequestsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(currentUser: EmployeeContext, dto: CreateChangeRequestDto) {
    const client = this.supabaseService.getClient();

    if (dto.fieldName === 'department_code') {
      const dept = await this.findDepartmentByCode(dto.requestedValue);
      if (!dept) throw new BadRequestException(`No department with code "${dto.requestedValue}".`);
    }
    if (dto.fieldName === 'birth_date' && Number.isNaN(Date.parse(dto.requestedValue))) {
      throw new BadRequestException('requestedValue must be a valid date for birth_date.');
    }

    const currentValue = await this.captureCurrentValue(currentUser, dto.fieldName);

    const { data, error } = await client
      .from('change_requests')
      .insert({
        employee_id: currentUser.id,
        field_name: dto.fieldName,
        current_value: currentValue,
        requested_value: dto.requestedValue,
        reason: dto.reason,
      })
      .select('*')
      .single<ChangeRequestRow>();
    if (error) throw new BadRequestException(error.message);
    return this.toResponse(data);
  }

  async findMine(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('change_requests')
      .select('*')
      .eq('employee_id', currentUser.id)
      .order('created_at', { ascending: false })
      .returns<ChangeRequestRow[]>();
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((r) => this.toResponse(r));
  }

  /** ADMIN-only — every pending request across every employee, oldest first (same
   * triage order as the document Review Queue). */
  async findPending() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('change_requests')
      .select('*, employees!change_requests_employee_id_fkey(employee_id, full_name, job_title)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((r) => this.toResponse(r, true));
  }

  async approve(currentUser: EmployeeContext, id: string) {
    const request = await this.getPendingOrThrow(id);
    await this.applyApproved(request);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('change_requests')
      .update({ status: 'APPROVED', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single<ChangeRequestRow>();
    if (error) throw new BadRequestException(error.message);
    return this.toResponse(data);
  }

  async reject(currentUser: EmployeeContext, id: string, dto: RejectChangeRequestDto) {
    await this.getPendingOrThrow(id);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('change_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        review_notes: dto.reviewNotes ?? null,
      })
      .eq('id', id)
      .select('*')
      .single<ChangeRequestRow>();
    if (error) throw new BadRequestException(error.message);
    return this.toResponse(data);
  }

  private async getPendingOrThrow(id: string): Promise<ChangeRequestRow> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('change_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle<ChangeRequestRow>();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Change request not found.');
    if (data.status !== 'PENDING') {
      throw new BadRequestException(`This request has already been ${data.status.toLowerCase()}.`);
    }
    return data;
  }

  private async findDepartmentByCode(code: string): Promise<{ id: string } | null> {
    const { data } = await this.supabaseService
      .getClient()
      .from('departments')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle();
    return data;
  }

  private async captureCurrentValue(currentUser: EmployeeContext, field: EditableField): Promise<string | null> {
    if (field === 'department_code') {
      const { data } = await this.supabaseService
        .getClient()
        .from('employees')
        .select('departments!employees_department_id_fkey(code)')
        .eq('id', currentUser.id)
        .maybeSingle();
      const dept = Array.isArray(data?.departments) ? data?.departments[0] : data?.departments;
      return dept?.code ?? null;
    }
    const column = DIRECT_COLUMN[field]!;
    const { data } = await this.supabaseService.getClient().from('employees').select(column).eq('id', currentUser.id).maybeSingle();
    return (data as Record<string, string | null> | null)?.[column] ?? null;
  }

  /** The one place that actually mutates the employee record — only reachable via approve(),
   * which only ever runs after getPendingOrThrow(), so this never double-applies a request. */
  private async applyApproved(request: ChangeRequestRow) {
    const client = this.supabaseService.getClient();

    if (request.field_name === 'department_code') {
      const dept = await this.findDepartmentByCode(request.requested_value);
      if (!dept) throw new BadRequestException(`No department with code "${request.requested_value}" — cannot approve.`);
      const { error } = await client
        .from('employees')
        .update({ department_id: dept.id, updated_at: new Date().toISOString() })
        .eq('id', request.employee_id);
      if (error) throw new BadRequestException(error.message);
      return;
    }

    const column = DIRECT_COLUMN[request.field_name as EditableField]!;
    const { error } = await client
      .from('employees')
      .update({ [column]: request.requested_value, updated_at: new Date().toISOString() })
      .eq('id', request.employee_id);
    if (error) throw new BadRequestException(error.message);
  }

  private toResponse(row: ChangeRequestRow & { employees?: ReviewerInfo | ReviewerInfo[] }, withEmployee = false) {
    const employee = withEmployee ? (Array.isArray(row.employees) ? row.employees[0] : row.employees) : undefined;
    return {
      id: row.id,
      fieldName: row.field_name,
      currentValue: row.current_value,
      requestedValue: row.requested_value,
      reason: row.reason,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      createdAt: row.created_at,
      ...(employee && {
        employee: { employeeId: employee.employee_id, fullName: employee.full_name, jobTitle: employee.job_title },
      }),
    };
  }
}
