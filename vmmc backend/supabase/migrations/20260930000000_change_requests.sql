-- Aug 31 feedback: "change request tracker" — there was no way to correct an
-- employee's job_title/birth_date/department/employment_status short of a raw
-- DB edit. birth_date specifically drives the whole SLA cycle-date calculation
-- (see BACKEND_ARCHITECTURE.md §3), so a wrong one silently breaks someone's
-- compliance deadlines with no way to fix it. This adds a request-and-approve
-- workflow instead of direct self-service editing for these fields, the same
-- way review_status already gates document approval.

create table change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  field_name text not null,           -- job_title | birth_date | employment_status | department_code
  current_value text,                 -- server-captured snapshot at submission time, not client-trusted
  requested_value text not null,
  reason text not null,
  status review_status not null default 'PENDING',  -- reuses the existing PENDING|APPROVED|REJECTED enum
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now());

create index change_requests_employee_id_idx on change_requests(employee_id);
create index change_requests_status_idx on change_requests(status);
