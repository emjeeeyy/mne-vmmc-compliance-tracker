-- Real email-based 2FA on login, deliberately kept separate from
-- password_reset_otps rather than reusing it — different trust context
-- (every login vs. only a forgotten password), and sharing one table would
-- need an extra "purpose" filter on every lookup just to avoid a stray
-- unconsumed row from one flow accidentally satisfying the other.
-- access_token/token_expires_at: Supabase's signInWithPassword() already issues a real session
-- the moment the password is verified (before the OTP step even starts) — there's no password to
-- re-check in step 2, only employeeId/portal/otp, so there's nothing to re-authenticate *with* to
-- mint a fresh session at that point. Stashing the already-issued token here and only handing it
-- back once the OTP is confirmed is what actually makes it a second *factor* rather than a second
-- password prompt — short-lived (same table, same expiry, same RLS as password_reset_otps), never
-- exposed through any read API, and consumed the moment it's used.
create table login_otps (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count int not null default 0,
  access_token text not null,
  token_expires_at bigint not null,
  created_at timestamptz default now()
);

create index login_otps_employee_id_idx on login_otps(employee_id);

alter table login_otps enable row level security;

-- Opt-in per employee; defaults to false so this never silently changes
-- behavior for an existing account. Profile's toggle (currently decorative
-- local-only state) will read/write this for real.
alter table employees
  add column if not exists two_factor_enabled boolean not null default false;
