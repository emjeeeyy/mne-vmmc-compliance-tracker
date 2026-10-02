export type EventType = 'INFORMATIONAL' | 'WARNING' | 'EXCEPTION';

export type EventSubtype =
  | 'WINDOW_OPENED'
  | 'CLEARANCE_RECORDED'
  | 'FIRST_REMINDER'
  | 'BIRTHDAY_DUE'
  | 'WEEKLY_REMINDER'
  | 'THREE_MONTH_HR_NOTICE'
  | 'SLA_BREACH'
  | 'CLINICAL_ALERT'
  | 'PEP_FOLLOWUP_MISSED'
  | 'IMMUNIZATION_OVERDUE'
  | 'DOCUMENT_REJECTED';

export interface ComplianceRecordRow {
  id: string;
  employee_id: string;
  cycle_year: number;
  birthday_date: string;
  window_open_date: string;
  due_date: string;
  status: 'COMPLIANT' | 'PENDING' | 'NON_COMPLIANT' | 'OVERDUE';
  clinical_status: 'COMPLIANT' | 'CRITICAL' | 'PENDING';
}
