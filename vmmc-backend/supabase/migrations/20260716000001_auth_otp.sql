-- Phase 2 — forgot-password OTP handoff. Delivery channel (email/SMS) is
-- wired in Phase 7; this table just tracks issuance/verification so the flow
-- is fully functional (console-logged code) ahead of that.

create table password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz default now()
);

create index password_reset_otps_employee_id_idx on password_reset_otps(employee_id);

alter table password_reset_otps enable row level security;
