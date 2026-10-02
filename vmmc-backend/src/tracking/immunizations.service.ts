import { Injectable, NotFoundException } from '@nestjs/common';
import { assertRecordAccess } from '../common/assert-access';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateImmunizationDto } from './dto/create-immunization.dto';

export interface ImmunizationRow {
  id: string;
  employee_id: string;
  vaccine_type: string;
  dose: number;
  administered_date: string;
  next_due_date: string | null;
  quarter: string | null;
}

@Injectable()
export class ImmunizationsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listForEmployee(currentUser: EmployeeContext, employeeId: string) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client.from('employees').select('id, department_id').eq('id', employeeId).maybeSingle();
    if (!employee) throw new NotFoundException('Employee not found.');
    assertRecordAccess(currentUser, employee.department_id, employee.id);

    const { data, error } = await client
      .from('immunizations')
      .select('id, employee_id, vaccine_type, dose, administered_date, next_due_date, quarter')
      .eq('employee_id', employeeId)
      .order('administered_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async create(employeeId: string, dto: CreateImmunizationDto) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client.from('employees').select('id').eq('id', employeeId).maybeSingle();
    if (!employee) throw new NotFoundException('Employee not found.');

    const { data, error } = await client
      .from('immunizations')
      .insert({
        employee_id: employeeId,
        vaccine_type: dto.vaccineType,
        dose: dto.dose,
        administered_date: dto.administeredDate,
        next_due_date: dto.nextDueDate ?? null,
        quarter: dto.quarter ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Overdue = this is the most recent dose per employee+vaccine and its next_due_date has passed
   * (an employee who already logged a newer dose is, by definition, no longer overdue on the old one).
   * Picks the latest dose per employee+vaccine FIRST, then checks overdue-ness on that one row only —
   * otherwise an old overdue dose superseded by an on-time newer one would be wrongly flagged. */
  async findOverdueDoses(): Promise<ImmunizationRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('immunizations')
      .select('id, employee_id, vaccine_type, dose, administered_date, next_due_date, quarter')
      .order('administered_date', { ascending: false });
    if (error) throw error;

    const latestByEmployeeVaccine = new Map<string, ImmunizationRow>();
    for (const row of data ?? []) {
      const key = `${row.employee_id}:${row.vaccine_type}`;
      if (!latestByEmployeeVaccine.has(key)) latestByEmployeeVaccine.set(key, row);
    }

    const today = new Date().toISOString().slice(0, 10);
    return Array.from(latestByEmployeeVaccine.values()).filter((row) => row.next_due_date && row.next_due_date < today);
  }
}
