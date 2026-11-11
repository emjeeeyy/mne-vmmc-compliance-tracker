-- The gap between weekly reminders was a hard-coded 7 days in the event classifier, and the weekly_reminder and
-- target_rate columns were never read. The classifier and the admin dashboard now read them (for the APE row), so the
-- gap becomes a setting too. Purely additive: the default (7) is what the code did before, so nothing changes until
-- someone edits the row. A backend deployed before this migration keeps working (it falls back to 7).
alter table sla_definitions
  add column if not exists weekly_reminder_interval_days int not null default 7
  check (weekly_reminder_interval_days between 1 and 90);

comment on column sla_definitions.weekly_reminder_interval_days is
  'Days between weekly reminders once the birthday has passed (APE row). Read by SlaSettingsService.';

comment on table sla_definitions is
  'The app reads the APE row only: first_reminder_days_before_birthday, weekly_reminder, weekly_reminder_interval_days, target_rate, active. NOT read: the IMMUNIZATION row and the recurrence column (immunization reminders follow each dose''s own next_due_date, one alert when it is overdue). Editing those values changes nothing.';
