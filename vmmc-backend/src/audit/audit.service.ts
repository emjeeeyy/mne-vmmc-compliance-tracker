import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuditLogParams {
  actorId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  location?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Writes to the append-only `audit_logs` table — nothing here ever updates or deletes a row. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async log(params: AuditLogParams) {
    const { error } = await this.supabaseService.getClient().from('audit_logs').insert({
      actor_id: params.actorId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      location: params.location ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
    });
    if (error) this.logger.error(`Failed to write audit log (${params.action}): ${error.message}`);
  }
}
