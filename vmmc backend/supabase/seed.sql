-- VMMC TB DOTS — Phase 1 seed data (spec §4 / Phase 1)
-- 4 departments, APE + Quarterly-Immunization SLA definitions, ~20 employees
-- with canonical VMMC-YY-NNNN IDs and birthdays spread across the year.
-- Employees are not yet linked to auth.users — that linkage happens in Phase 2
-- when Supabase Auth accounts are created for login.

with dept as (
  insert into departments (name, code) values
    ('OPD Nursing', 'OPD'),
    ('Radiology', 'RAD'),
    ('Dietary', 'DIET'),
    ('Administration', 'ADM')
  returning id, code
)
insert into employees (employee_id, full_name, job_title, email, phone, role, department_id, birth_date, date_hired, employment_status)
select v.employee_id, v.full_name, v.job_title, v.email, v.phone, v.role::role, dept.id, v.birth_date::date, v.date_hired::date, 'ACTIVE'
from (values
  ('VMMC-23-0001', 'Arturo V. Santos',    'TB Head / Medical Director',   'arturo.santos@vmmc.gov.ph',    '+639170000001', 'ADMIN',     'ADM',  '1975-03-12', '2005-01-10'),
  ('VMMC-23-0002', 'Juan Dela Cruz',      'Nurse Unit Supervisor',        'juan.delacruz@vmmc.gov.ph',    '+639170000002', 'UNIT_HEAD', 'OPD',  '1985-01-15', '2008-03-01'),
  ('VMMC-23-0003', 'Maria Santos',        'Radiology Unit Head',          'maria.santos@vmmc.gov.ph',     '+639170000003', 'UNIT_HEAD', 'RAD',  '1980-02-20', '2007-06-15'),
  ('VMMC-23-0004', 'Elena Cruz',          'Dietary Unit Head',            'elena.cruz@vmmc.gov.ph',       '+639170000004', 'UNIT_HEAD', 'DIET', '1982-04-05', '2009-09-20'),
  ('VMMC-23-0005', 'Roberto Reyes',       'Administration Unit Head',     'roberto.reyes@vmmc.gov.ph',    '+639170000005', 'UNIT_HEAD', 'ADM',  '1978-05-18', '2006-11-02'),
  ('VMMC-24-0006', 'Ana Garcia',          'Staff Nurse',                  'ana.garcia@vmmc.gov.ph',       '+639170000006', 'STAFF',     'OPD',  '1990-06-02', '2015-02-10'),
  ('VMMC-24-0007', 'Carlos Bautista',     'Staff Nurse',                  'carlos.bautista@vmmc.gov.ph',  '+639170000007', 'STAFF',     'OPD',  '1992-07-14', '2016-04-18'),
  ('VMMC-24-0008', 'Rosa Fernandez',      'Staff Nurse',                  'rosa.fernandez@vmmc.gov.ph',   '+639170000008', 'STAFF',     'OPD',  '1988-08-22', '2013-07-22'),
  ('VMMC-24-0009', 'Miguel Torres',       'Staff Nurse',                  'miguel.torres@vmmc.gov.ph',    '+639170000009', 'STAFF',     'OPD',  '1995-09-09', '2019-01-05'),
  ('VMMC-24-0010', 'Josefina Ramos',      'Radiologic Technologist',      'josefina.ramos@vmmc.gov.ph',   '+639170000010', 'STAFF',     'RAD',  '1991-10-11', '2017-03-14'),
  ('VMMC-24-0011', 'Antonio Diaz',        'Radiologic Technologist',      'antonio.diaz@vmmc.gov.ph',     '+639170000011', 'STAFF',     'RAD',  '1987-11-25', '2012-10-01'),
  ('VMMC-24-0012', 'Teresa Lopez',        'Radiologic Technologist',      'teresa.lopez@vmmc.gov.ph',     '+639170000012', 'STAFF',     'RAD',  '1993-12-03', '2018-06-09'),
  ('VMMC-25-0013', 'Fernando Aquino',     'Radiologic Technologist',      'fernando.aquino@vmmc.gov.ph',  '+639170000013', 'STAFF',     'RAD',  '1989-01-30', '2014-08-25'),
  ('VMMC-25-0014', 'Isabel Mendoza',      'Dietary Aide',                 'isabel.mendoza@vmmc.gov.ph',   '+639170000014', 'STAFF',     'DIET', '1994-02-17', '2019-05-13'),
  ('VMMC-25-0015', 'Ricardo Villanueva',  'Dietary Aide',                 'ricardo.villanueva@vmmc.gov.ph','+639170000015', 'STAFF',     'DIET', '1986-03-28', '2011-02-28'),
  ('VMMC-25-0016', 'Lourdes Castro',      'Nutritionist-Dietitian',       'lourdes.castro@vmmc.gov.ph',   '+639170000016', 'STAFF',     'DIET', '1990-04-19', '2015-09-30'),
  ('VMMC-25-0017', 'Eduardo Morales',     'Dietary Aide',                 'eduardo.morales@vmmc.gov.ph',  '+639170000017', 'STAFF',     'DIET', '1996-05-07', '2020-01-15'),
  ('VMMC-25-0018', 'Cristina Navarro',    'Administrative Staff',        'cristina.navarro@vmmc.gov.ph', '+639170000018', 'STAFF',     'ADM',  '1992-06-24', '2017-11-11'),
  ('VMMC-25-0019', 'Manuel Pascual',      'Administrative Staff',        'manuel.pascual@vmmc.gov.ph',   '+639170000019', 'STAFF',     'ADM',  '1988-07-08', '2013-04-04'),
  ('VMMC-25-0020', 'Angela Domingo',      'Records Officer',              'angela.domingo@vmmc.gov.ph',   '+639170000020', 'STAFF',     'ADM',  '1993-08-16', '2018-12-01')
) as v(employee_id, full_name, job_title, email, phone, role, dept_code, birth_date, date_hired)
join dept on dept.code = v.dept_code;

-- Wire each department's unit_head_id to the seeded UNIT_HEAD in that department.
update departments d set unit_head_id = e.id
from employees e
where e.department_id = d.id and e.role = 'UNIT_HEAD';

insert into sla_definitions (name, tracking_type, first_reminder_days_before_birthday, weekly_reminder, recurrence, target_rate, active) values
  ('Annual Physical Examination', 'APE', 14, true, 'ANNUAL', 0.95, true),
  ('Quarterly Immunization', 'IMMUNIZATION', 14, true, 'QUARTERLY', 0.95, true);
