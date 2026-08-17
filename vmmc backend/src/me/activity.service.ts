import { Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { describeUserAgent } from '../common/describe-user-agent';
import { SupabaseService } from '../supabase/supabase.service';

interface AuditLogRow {
  action: string;
  entity_type: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

const ENTITY_LABELS: Record<string, string> = {
  auth: 'Account',
  compliance: 'Health Registry Tracker',
  documents: 'Laboratory Documents',
  'review-queue': 'Review Queue',
  escalations: 'Escalations',
  reports: 'Compliance Reports',
  'pep-logs': 'PEP Exposure Log',
  immunizations: 'Immunization Record',
  'pre-employment': 'Pre-Employment Screening',
  me: 'Profile', // fallback for a bare /me request with no sub-resource segment (shouldn't occur in practice)
  'me-profile': 'Profile',
  'me-compliance-summary': 'My Compliance Record',
  'me-documents': 'My Documents',
  'me-notifications': 'Notifications',
  'me-signature': 'Digital Signature',
  'me-security': 'Account Security',
  'me-privacy-settings': 'Data Privacy Settings',
  'me-performance-stats': 'Performance Stats',
  'me-activity-logs': 'Activity Logs',
  'me-login-history': 'Login History',
  'me-devices': 'Registered Devices',
};

function describe(action: string, entityType: string | null): string {
  const label = (entityType && ENTITY_LABELS[entityType]) || 'Record';
  if (action === 'LOGIN') return 'Secure Login Successful';
  if (action === 'ACCESS_DENIED') return `Blocked Access Attempt: ${label}`;
  if (action === 'ACCESS') return `Accessed ${label}`;
  if (action === 'CREATE') return `Created ${label} Entry`;
  if (action === 'UPDATE') return `Updated ${label}`;
  if (action === 'DELETE') return `Deleted ${label} Entry`;
  return `${action} — ${label}`;
}

@Injectable()
export class ActivityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listActivityLogs(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('action, entity_type, ip_address, user_agent, timestamp')
      .eq('actor_id', currentUser.id)
      .order('timestamp', { ascending: false })
      .limit(30)
      .returns<AuditLogRow[]>();
    if (error) throw error;

    return (data ?? []).map((row) => ({
      title: describe(row.action, row.entity_type),
      time: row.timestamp,
      ip: row.ip_address,
    }));
  }

  async listLoginHistory(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('action, entity_type, ip_address, user_agent, timestamp')
      .eq('actor_id', currentUser.id)
      .eq('action', 'LOGIN')
      .order('timestamp', { ascending: false })
      .limit(20)
      .returns<AuditLogRow[]>();
    if (error) throw error;

    return (data ?? []).map((row, index) => ({
      device: describeUserAgent(row.user_agent),
      ip: row.ip_address,
      time: row.timestamp,
      current: index === 0,
    }));
  }
}
