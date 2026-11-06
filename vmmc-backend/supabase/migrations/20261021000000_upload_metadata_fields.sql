-- New optional upload metadata, persisted and shown to the reviewing admin — not decorative.
alter table documents add column title text;
alter table documents add column facility_name text;
alter table documents add column notes text;
