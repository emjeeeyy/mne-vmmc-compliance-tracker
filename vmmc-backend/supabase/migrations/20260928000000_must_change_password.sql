-- login_update branch (first-login password reset) reads/writes
-- employees.must_change_password, but the column was never migrated.
-- signup() sets it true on account creation; completeFirstLoginPasswordChange()
-- clears it once the employee sets their own password.

alter table employees
  add column if not exists must_change_password boolean not null default false;
