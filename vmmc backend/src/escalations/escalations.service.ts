import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EmployeeContext } from '../auth/types/role';

interface EventRow {
  id: string;
  employee_id: string;
  compliance_record_id: string | null;
  event_subtype: string;
}

interface EscalationEventEmbed {
  event_type: string;
  event_subtype: string;
  severity: number;
  message: string;
}

interface EscalationEmployeeEmbed {
  id: string;
  employee_id: string;
  full_name: string;
}

interface EscalationRow {
  id: string;
  status: string;
  breach_duration_days: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  events: EscalationEventEmbed | EscalationEventEmbed[];
  employee: EscalationEmployeeEmbed | EscalationEmployeeEmbed[];
  escalated_to: EscalationEmployeeEmbed | EscalationEmployeeEmbed[];
}

@Injectable()
export class EscalationsService {
  private readonly logger = new Logger(EscalationsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /** Called once per EXCEPTION event (event_id is UNIQUE on escalations, so this is naturally idempotent). */
  async createForEvent(event: EventRow) {
    const client = this.supabaseService.getClient();

    const { data: employee } = await client
      .from('employees')
      .select('id, department_id')
      .eq('id', event.employee_id)
      .maybeSingle();
    if (!employee) return;

    const { data: department } = await client
      .from('departments')
      .select('unit_head_id')
      .eq('id', employee.department_id)
      .maybeSingle();
    if (!department?.unit_head_id) {
      this.logger.warn(`No unit head to escalate to for department of employee ${event.employee_id}.`);
      return;
    }

    let breachDurationDays: number | null = null;
    if (event.event_subtype === 'SLA_BREACH' && event.compliance_record_id) {
      const { data: record } = await client
        .from('compliance_records')
        .select('due_date')
        .eq('id', event.compliance_record_id)
        .maybeSingle();
      if (record) {
        breachDurationDays = Math.max(
          0,
          Math.floor((Date.now() - new Date(record.due_date).getTime()) / 86_400_000),
        );
      }
    }

    const { error } = await client.from('escalations').insert({
      event_id: event.id,
      employee_id: event.employee_id,
      escalated_to_id: department.unit_head_id,
      status: 'OPEN',
      breach_duration_days: breachDurationDays,
    });
    // Unique violation on event_id just means this exact event was already escalated — not an error.
    if (error && error.code !== '23505') {
      this.logger.error(`Failed to create escalation for event ${event.id}: ${error.message}`);
    }
  }

  async findAll(currentUser: EmployeeContext) {
    const client = this.supabaseService.getClient();
    let query = client
      .from('escalations')
      .select(
        `id, status, breach_duration_days, acknowledged_at, resolved_at, created_at,
         events!inner ( event_type, event_subtype, severity, message ),
         employee:employees!escalations_employee_id_fkey ( id, employee_id, full_name ),
         escalated_to:employees!escalations_escalated_to_id_fkey ( id, employee_id, full_name )`,
      )
      .order('created_at', { ascending: false });

    if (currentUser.role === 'UNIT_HEAD') {
      query = query.eq('escalated_to_id', currentUser.id);
    } else if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('You do not have permission to view escalations.');
    }

    const { data, error } = await query.returns<EscalationRow[]>();
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const event = Array.isArray(row.events) ? row.events[0] : row.events;
      const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const escalatedTo = Array.isArray(row.escalated_to) ? row.escalated_to[0] : row.escalated_to;
      const timeToAckMinutes = row.acknowledged_at
        ? Math.round((new Date(row.acknowledged_at).getTime() - new Date(row.created_at).getTime()) / 60_000)
        : null;
      return {
        id: row.id,
        status: row.status,
        breachDurationDays: row.breach_duration_days,
        acknowledgedAt: row.acknowledged_at,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        timeToAckMinutes,
        event: { type: event?.event_type, subtype: event?.event_subtype, severity: event?.severity, message: event?.message },
        employee: { id: employee?.id, employeeId: employee?.employee_id, fullName: employee?.full_name },
        escalatedTo: { id: escalatedTo?.id, employeeId: escalatedTo?.employee_id, fullName: escalatedTo?.full_name },
      };
    });
  }

  async acknowledge(currentUser: EmployeeContext, id: string) {
    return this.transition(currentUser, id, { acknowledged_at: new Date().toISOString(), status: 'ACKNOWLEDGED' }, [
      'OPEN',
    ]);
  }

  async resolve(currentUser: EmployeeContext, id: string) {
    return this.transition(currentUser, id, { resolved_at: new Date().toISOString(), status: 'RESOLVED' }, [
      'OPEN',
      'ACKNOWLEDGED',
    ]);
  }

  private async transition(
    currentUser: EmployeeContext,
    id: string,
    patch: Record<string, string>,
    allowedFrom: string[],
  ) {
    const client = this.supabaseService.getClient();
    const { data: escalation, error: findError } = await client
      .from('escalations')
      .select('id, status, escalated_to_id')
      .eq('id', id)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!escalation) throw new NotFoundException('Escalation not found.');

    if (currentUser.role !== 'ADMIN' && escalation.escalated_to_id !== currentUser.id) {
      throw new ForbiddenException('You do not have permission to act on this escalation.');
    }
    if (!allowedFrom.includes(escalation.status)) {
      throw new BadRequestException(`Cannot transition from status "${escalation.status}".`);
    }

    const { error } = await client.from('escalations').update(patch).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return { message: 'Updated.' };
  }
}
