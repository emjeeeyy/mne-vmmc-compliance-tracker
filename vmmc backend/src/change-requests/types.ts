/** Fields that go through the request-and-approve workflow instead of direct
 * self-service editing (contrast with fullName/email/phone on ProfileService.updateProfile,
 * which apply immediately with no review). birth_date drives SLA cycle dates, department_code
 * changes who reviews someone's documents — both are consequential enough to warrant a second
 * pair of eyes before taking effect. */
export const EDITABLE_FIELDS = ['job_title', 'birth_date', 'employment_status', 'department_code'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface ChangeRequestRow {
  id: string;
  employee_id: string;
  field_name: string;
  current_value: string | null;
  requested_value: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}
