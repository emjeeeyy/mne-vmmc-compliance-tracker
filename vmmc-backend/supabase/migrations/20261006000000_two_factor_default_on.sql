-- The previous migration (20261005000000_login_2fa.sql) defaulted
-- two_factor_enabled to false for every account. Reconsidered: for a system
-- handling health/PII data, the safer default is the other way around —
-- every account starts with 2FA ON, and a user has to deliberately turn it
-- off for themselves via Profile, rather than everyone starting unprotected
-- and having to opt in. Two parts, since changing a column's default only
-- affects *future* inserts, not rows that already exist:
alter table employees
  alter column two_factor_enabled set default true;

-- Retroactively flips every existing employee to the new default too —
-- "every account should be 2FA on unless they log in and turn it off
-- themselves" applies to accounts that already existed before this
-- migration just as much as ones created after it.
update employees set two_factor_enabled = true;
