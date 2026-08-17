import { Injectable, NotFoundException } from '@nestjs/common';
import { assertRecordAccess } from '../common/assert-access';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertPreEmploymentDto } from './dto/upsert-pre-employment.dto';

@Injectable()
export class PreEmploymentService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async get(currentUser: EmployeeContext, employeeId: string) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client
      .from('employees')
      .select('id, department_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (!employee) throw new NotFoundException('Employee not found.');
    assertRecordAccess(currentUser, employee.department_id, employee.id);

    const { data, error } = await client
      .from('pre_employment')
      .select('id, employee_id, baseline_xray_path, screening_result, fit_for_duty, cleared_at')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** ADMIN-only create/update — upserts on employee_id since pre-employment screening is one baseline per hire. */
  async upsert(employeeId: string, dto: UpsertPreEmploymentDto) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client.from('employees').select('id').eq('id', employeeId).maybeSingle();
    if (!employee) throw new NotFoundException('Employee not found.');

    const { data: existing } = await client.from('pre_employment').select('id').eq('employee_id', employeeId).maybeSingle();

    const patch = {
      ...(dto.baselineXrayPath !== undefined && { baseline_xray_path: dto.baselineXrayPath }),
      ...(dto.screeningResult !== undefined && { screening_result: dto.screeningResult }),
      ...(dto.fitForDuty !== undefined && { fit_for_duty: dto.fitForDuty, cleared_at: dto.fitForDuty ? new Date().toISOString() : null }),
    };

    if (existing) {
      const { data, error } = await client.from('pre_employment').update(patch).eq('id', existing.id).select().single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await client
      .from('pre_employment')
      .insert({ employee_id: employeeId, ...patch })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
