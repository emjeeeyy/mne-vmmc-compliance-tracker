-- Phase 10 — audit/security hardening.
-- 1. Per-employee data-privacy toggles (Profile > Data Privacy Settings).
-- 2. Append-only enforcement at the database level for events/audit_logs —
--    the application code never updates or deletes these rows, but a DB-level
--    trigger makes that a guarantee rather than just a convention.

alter table employees
  add column if not exists privacy_settings jsonb not null default '{"encryptRecords": true, "shareAnalytics": false, "telemetryLogging": true}'::jsonb;

create or replace function reject_mutation() returns trigger as $$
begin
  raise exception '% is append-only — % is not permitted', TG_TABLE_NAME, TG_OP;
end;
$$ language plpgsql;

drop trigger if exists events_append_only on events;
create trigger events_append_only
  before update or delete on events
  for each row execute function reject_mutation();

drop trigger if exists audit_logs_append_only on audit_logs;
create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function reject_mutation();
