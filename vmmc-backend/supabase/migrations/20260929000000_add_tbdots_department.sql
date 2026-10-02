-- Aug 31 feedback: document access was tightened to "department head, TB DOTS
-- staff, and HR only" (see assertDocumentAccess in src/common/assert-access.ts),
-- but there was no way to identify "TB DOTS staff" at all — departments were just
-- OPD/RAD/DIET/ADM. Adds a real TB DOTS Program department; assertDocumentAccess
-- grants document access to any STAFF/UNIT_HEAD whose department code is TBDOTS.
-- No existing employees are reassigned here — that's a real staffing decision for
-- whoever actually runs the TB DOTS program, not something to infer from code.

insert into departments (name, code)
values ('TB DOTS Program', 'TBDOTS')
on conflict (code) do nothing;
