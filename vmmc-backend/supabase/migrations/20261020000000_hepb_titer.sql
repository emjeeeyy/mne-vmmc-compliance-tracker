-- Hep B Titers: a new one-time, self-submitted/admin-reviewed document category,
-- reusing the existing `documents` review lifecycle rather than a parallel module —
-- clinically distinct from APE (chest X-ray/GeneXpert) and from an immunization dose.
alter type tracking_type add value 'HEPB_TITER';

create type titer_result as enum ('REACTIVE', 'NON_REACTIVE', 'NOT_APPLICABLE');

alter table documents add column titer_result titer_result not null default 'NOT_APPLICABLE';
