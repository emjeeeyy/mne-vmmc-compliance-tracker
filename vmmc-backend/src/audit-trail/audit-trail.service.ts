import { Injectable } from '@nestjs/common';
import { AuditLogRow, dedupeBursts, describe, isNoise } from '../me/activity.service';
import { SupabaseService } from '../supabase/supabase.service';

export const DEFAULT_TRAIL_LIMIT = 25;
export const MAX_TRAIL_LIMIT = 50;
/** How many raw rows to read per row returned: noise and burst filtering both shrink the result. */
const OVERFETCH = 6;

type Role = 'STAFF' | 'UNIT_HEAD' | 'ADMIN';

export interface TrailRow extends AuditLogRow {
  actor_id: string | null;
}

export interface ActorRow {
  id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  role: Role;
}

export interface AuditTrailEntry {
  time: string;
  /** Plain-words version, e.g. "Accessed Laboratory Documents". */
  title: string;
  /** Raw audit code and the entity it touched, for the table's action / resource columns. */
  action: string;
  entityType: string | null;
  entityRef: string | null;
  /** Null when the row has no signed-in actor (e.g. a failed sign-in). */
  actor: { employeeId: string; fullName: string; role: Role; jobTitle: string | null } | null;
}

/** Pure: filter, de-duplicate per person, and shape the rows. Noise and burst rules are the same ones the personal
 * Activity Logs use (so the page-load background reads don't flood the trail), but a burst is now per actor, since
 * two different people opening the same page at the same moment are two real events. */
export function buildTrail(rows: TrailRow[], actors: Map<string, ActorRow>, limit: number): AuditTrailEntry[] {
  const meaningful = rows.filter((row) => !isNoise(row));
  return dedupeBursts(meaningful, (row) => `${row.actor_id ?? ''}:${row.action}:${row.entity_type ?? ''}`)
    .slice(0, limit)
    .map((row) => {
      const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
      return {
        time: row.timestamp,
        title: describe(row.action, row.entity_type),
        action: row.action,
        entityType: row.entity_type,
        entityRef: row.entity_id ? row.entity_id.replace(/-/g, '').slice(0, 6).toUpperCase() : null,
        actor: actor ? { employeeId: actor.employee_id, fullName: actor.full_name, role: actor.role, jobTitle: actor.job_title } : null,
      };
    });
}

/** The admin's system-wide view of the append-only audit log (the personal Activity Logs only ever show your own rows). */
@Injectable()
export class AuditTrailService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(limit: number = DEFAULT_TRAIL_LIMIT): Promise<AuditTrailEntry[]> {
    const wanted = Math.min(Math.max(1, limit), MAX_TRAIL_LIMIT);
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('audit_logs')
      .select('actor_id, action, entity_type, entity_id, ip_address, user_agent, timestamp')
      .order('timestamp', { ascending: false })
      .limit(wanted * OVERFETCH)
      .returns<TrailRow[]>();
    if (error) throw error;
    const rows = data ?? [];

    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
    const actors = new Map<string, ActorRow>();
    if (actorIds.length > 0) {
      const { data: people, error: peopleError } = await client
        .from('employees')
        .select('id, employee_id, full_name, job_title, role')
        .in('id', actorIds)
        .returns<ActorRow[]>();
      if (peopleError) throw peopleError;
      for (const person of people ?? []) actors.set(person.id, person);
    }

    return buildTrail(rows, actors, wanted);
  }
}
