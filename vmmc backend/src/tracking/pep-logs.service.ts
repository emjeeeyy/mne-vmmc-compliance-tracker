import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertRecordAccess } from '../common/assert-access';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePepLogDto } from './dto/create-pep-log.dto';
import { UpdatePepLogDto } from './dto/update-pep-log.dto';

export interface PepLogRow {
  id: string;
  employee_id: string;
  exposure_date: string;
  exposure_type: string;
  prophylaxis_status: string;
  follow_up_date: string | null;
  notes: string | null;
}

const TERMINAL_STATUSES = ['COMPLETED', 'DECLINED'];

@Injectable()
export class PepLogsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listForEmployee(currentUser: EmployeeContext, employeeId: string) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client.from('employees').select('id, department_id').eq('id', employeeId).maybeSingle();
    if (!employee) throw new NotFoundException('Employee not found.');
    assertRecordAccess(currentUser, employee.department_id, employee.id);

    const { data, error } = await client
      .from('pep_logs')
      .select('id, employee_id, exposure_date, exposure_type, prophylaxis_status, follow_up_date, notes')
      .eq('employee_id', employeeId)
      .order('exposure_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async create(employeeId: string, dto: CreatePepLogDto) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client.from('employees').select('id').eq('id', employeeId).maybeSingle();
    if (!employee) throw new NotFoundException('Employee not found.');

    const { data, error } = await client
      .from('pep_logs')
      .insert({
        employee_id: employeeId,
        exposure_date: dto.exposureDate,
        exposure_type: dto.exposureType,
        prophylaxis_status: dto.prophylaxisStatus ?? 'PENDING',
        follow_up_date: dto.followUpDate ?? null,
        notes: dto.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(currentUser: EmployeeContext, id: string, dto: UpdatePepLogDto) {
    if (currentUser.role !== 'ADMIN') throw new ForbiddenException('Only the TB Head may update a PEP log.');
    const client = this.supabaseService.getClient();

    const patch = {
      ...(dto.prophylaxisStatus !== undefined && { prophylaxis_status: dto.prophylaxisStatus }),
      ...(dto.followUpDate !== undefined && { follow_up_date: dto.followUpDate }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    const { data, error } = await client.from('pep_logs').update(patch).eq('id', id).select().single();
    if (error) throw error;
    if (!data) throw new NotFoundException('PEP log not found.');
    return data;
  }

  /** Overdue = follow-up date has passed and the log hasn't reached a terminal status. */
  async findOverdueFollowUps(): Promise<PepLogRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pep_logs')
      .select('id, employee_id, exposure_date, exposure_type, prophylaxis_status, follow_up_date, notes')
      .not('follow_up_date', 'is', null)
      .lt('follow_up_date', today)
      .not('prophylaxis_status', 'in', `(${TERMINAL_STATUSES.join(',')})`);
    if (error) throw error;
    return data ?? [];
  }
}
