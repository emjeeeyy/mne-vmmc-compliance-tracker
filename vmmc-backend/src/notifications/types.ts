export interface DispatchedEvent {
  id: string;
  employee_id: string;
  compliance_record_id: string | null;
  event_type: 'INFORMATIONAL' | 'WARNING' | 'EXCEPTION';
  event_subtype: string;
  severity: number;
  message: string;
  detected_at: string;
}
