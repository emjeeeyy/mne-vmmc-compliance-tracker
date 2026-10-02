-- VMMC TB DOTS — initial schema (spec §4)
-- Accessed exclusively via the NestJS backend using the service-role key,
-- which bypasses RLS; RLS is enabled with no policies on every table so the
-- anon/authenticated keys can never reach these tables through PostgREST directly.

create type role             as enum ('STAFF','UNIT_HEAD','ADMIN');
create type tracking_type    as enum ('APE','PRE_EMPLOYMENT','PEP','IMMUNIZATION');
create type compliance_state as enum ('COMPLIANT','PENDING','NON_COMPLIANT','OVERDUE'); -- SLA-timeline
create type clinical_status  as enum ('COMPLIANT','CRITICAL','PENDING');                -- clinical rollup
create type event_type       as enum ('INFORMATIONAL','WARNING','EXCEPTION');
create type channel          as enum ('IN_APP','SMS','EMAIL');
create type review_status    as enum ('PENDING','APPROVED','REJECTED');
create type cxr_result       as enum ('CLEARED','INFILTRATE','PENDING','NOT_APPLICABLE');
create type genexpert_result as enum ('NOT_DETECTED','DETECTED','PENDING','NOT_APPLICABLE');

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null, code text unique not null,
  unit_head_id uuid, created_at timestamptz default now());

create table employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  employee_id text unique not null,                 -- canonical VMMC-YY-NNNN
  full_name text not null, job_title text,
  email text unique not null, phone text,
  role role not null default 'STAFF',
  department_id uuid not null references departments(id),
  birth_date date not null, date_hired date,
  employment_status text not null default 'ACTIVE',
  pin_hash text,
  created_at timestamptz default now(), updated_at timestamptz default now());

alter table departments add constraint departments_unit_head_fk
  foreign key (unit_head_id) references employees(id);

create table sla_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null, tracking_type tracking_type not null,
  first_reminder_days_before_birthday int not null default 14,
  weekly_reminder boolean not null default true,
  recurrence text not null default 'ANNUAL',        -- ANNUAL | QUARTERLY
  target_rate numeric not null default 0.95, active boolean not null default true);

create table compliance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  sla_definition_id uuid not null references sla_definitions(id),
  cycle_year int not null,
  birthday_date date not null, window_open_date date not null, due_date date not null,
  status compliance_state not null default 'PENDING',
  clinical_status clinical_status not null default 'PENDING',
  cleared_at timestamptz, lead_time_days int, approved_document_id uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (employee_id, sla_definition_id, cycle_year));

create table documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  compliance_record_id uuid references compliance_records(id),
  idempotency_key text unique,
  storage_path text not null, file_type text not null, file_size_bytes int not null,
  doc_type tracking_type not null,
  cxr_result cxr_result not null default 'NOT_APPLICABLE',
  genexpert_result genexpert_result not null default 'NOT_APPLICABLE',
  exam_date date,
  review_status review_status not null default 'PENDING',
  reviewed_by uuid references employees(id), reviewed_at timestamptz,
  rejection_reason text, signature_id uuid,
  uploaded_at timestamptz default now());

alter table compliance_records add constraint compliance_records_document_fk
  foreign key (approved_document_id) references documents(id);

create table digital_signatures (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references employees(id),
  signature_path text not null, is_active boolean not null default true,
  created_at timestamptz default now());

alter table documents add constraint documents_signature_fk
  foreign key (signature_id) references digital_signatures(id);

create table events (                                -- M&E EVENT LOG — append-only
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  compliance_record_id uuid references compliance_records(id),
  event_type event_type not null,
  event_subtype text not null,                       -- CLEARANCE_RECORDED|WINDOW_OPENED|FIRST_REMINDER|BIRTHDAY_DUE|WEEKLY_REMINDER|SLA_BREACH|CLINICAL_ALERT
  severity int not null default 0, message text not null,
  source text not null default 'monitoring-engine', payload jsonb,
  detected_at timestamptz default now());

create table notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  employee_id uuid not null references employees(id),
  channel channel not null, recipient text not null,
  status text not null default 'QUEUED', provider_ref text,
  retry_count int not null default 0, sent_at timestamptz, created_at timestamptz default now());

create table escalations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique not null references events(id) on delete cascade,
  employee_id uuid not null references employees(id),
  escalated_to_id uuid not null references employees(id),
  status text not null default 'OPEN', breach_duration_days int,
  acknowledged_at timestamptz, resolved_at timestamptz, created_at timestamptz default now());

create table devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  name text not null, device_type text, last_active timestamptz,
  location text, is_current boolean default false, trusted boolean default true,
  created_at timestamptz default now());

create table audit_logs (                            -- immutable — powers Activity Logs / Login History
  id uuid primary key default gen_random_uuid(),
  actor_id uuid, action text not null,               -- LOGIN|ACCESS|DOWNLOAD|CREATE|UPDATE|DELETE
  entity_type text, entity_id uuid,
  ip_address text, user_agent text, location text,
  before jsonb, after jsonb, "timestamp" timestamptz default now());

create table pep_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  exposure_date date not null, exposure_type text not null,
  prophylaxis_status text not null, follow_up_date date, notes text);

create table immunizations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  vaccine_type text not null, dose int not null,
  administered_date date not null, next_due_date date, quarter text);

create table pre_employment (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  baseline_xray_path text, screening_result text,
  fit_for_duty boolean not null default false, cleared_at timestamptz);

-- Indexes for the lookups every phase's endpoints will do (FK joins, tracker search/filter, scans).
create index employees_department_id_idx on employees(department_id);
create index employees_role_idx on employees(role);
create index compliance_records_employee_id_idx on compliance_records(employee_id);
create index compliance_records_status_idx on compliance_records(status);
create index compliance_records_due_date_idx on compliance_records(due_date);
create index documents_employee_id_idx on documents(employee_id);
create index documents_review_status_idx on documents(review_status);
create index events_employee_id_idx on events(employee_id);
create index events_detected_at_idx on events(detected_at);
create index notifications_employee_id_idx on notifications(employee_id);
create index escalations_employee_id_idx on escalations(employee_id);
create index escalations_status_idx on escalations(status);
create index devices_employee_id_idx on devices(employee_id);
create index audit_logs_actor_id_idx on audit_logs(actor_id);
create index audit_logs_timestamp_idx on audit_logs("timestamp");
create index pep_logs_employee_id_idx on pep_logs(employee_id);
create index immunizations_employee_id_idx on immunizations(employee_id);
create index pre_employment_employee_id_idx on pre_employment(employee_id);

-- RLS enabled, no policies: only the service-role key (used exclusively by the
-- NestJS backend) can reach these tables. anon/authenticated keys get nothing
-- via the auto-generated PostgREST API, even if ever exposed client-side.
alter table departments enable row level security;
alter table employees enable row level security;
alter table sla_definitions enable row level security;
alter table compliance_records enable row level security;
alter table documents enable row level security;
alter table digital_signatures enable row level security;
alter table events enable row level security;
alter table notifications enable row level security;
alter table escalations enable row level security;
alter table devices enable row level security;
alter table audit_logs enable row level security;
alter table pep_logs enable row level security;
alter table immunizations enable row level security;
alter table pre_employment enable row level security;
