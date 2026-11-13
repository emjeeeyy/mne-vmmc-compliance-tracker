import {
  apeBucket,
  buildApeRows,
  buildImmunizationRows,
  buildPepRows,
  buildPreEmploymentRows,
  nextCycleDueDate,
  PersonRow,
} from './registry-builders';

const TODAY = '2026-06-15';
const person = (n: number, name: string): PersonRow => ({
  id: `emp-${n}`,
  employee_id: `VMMC-26-000${n}`,
  full_name: name,
  job_title: 'Nurse',
  departments: { name: 'Nursing', code: 'NUR' },
});
const ANA = person(1, 'Ana Reyes');
const BEN = person(2, 'Ben Cruz');
const CARLA = person(3, 'Carla Diaz');

describe('nextCycleDueDate — due dates are month-ends, so "next year" must stay a month-end', () => {
  it.each([
    ['2026-07-31', '2027-07-31'],
    ['2026-06-30', '2027-06-30'],
    ['2027-02-28', '2028-02-29'], // a leap year ahead: the month-end moves, "+1 year" would not
    ['2028-02-29', '2029-02-28'], // and Feb 29 must not roll into March 1
  ])('%s -> %s', (due, expected) => expect(nextCycleDueDate(due)).toBe(expected));
});

describe('apeBucket — a clinical alert always needs action, however punctual the paperwork', () => {
  it('cleared and not critical -> up to date', () => {
    expect(apeBucket({ status: 'COMPLIANT', clinical_status: 'COMPLIANT', due_date: '2026-08-31' }, TODAY)).toBe('UP_TO_DATE');
  });
  it('cleared on time but CRITICAL -> action required', () => {
    expect(apeBucket({ status: 'COMPLIANT', clinical_status: 'CRITICAL', due_date: '2026-08-31' }, TODAY)).toBe('OVERDUE');
  });
  it('uncleared: past the deadline -> overdue; any future deadline -> upcoming, never "up to date / cleared"', () => {
    expect(apeBucket({ status: 'PENDING', clinical_status: 'PENDING', due_date: '2026-06-01' }, TODAY)).toBe('OVERDUE');
    expect(apeBucket({ status: 'PENDING', clinical_status: 'PENDING', due_date: '2026-06-30' }, TODAY)).toBe('DUE_SOON');
    // clearanceBucket would call this UP_TO_DATE (deadline > 15 days away); on a "Cleared" pill it must not
    expect(apeBucket({ status: 'PENDING', clinical_status: 'PENDING', due_date: '2026-09-30' }, TODAY)).toBe('DUE_SOON');
  });
});

describe('buildApeRows', () => {
  const records = [
    { employee_id: 'emp-1', status: 'COMPLIANT' as const, clinical_status: 'COMPLIANT' as const, due_date: '2026-07-31', approved_document_id: 'doc-1' },
    { employee_id: 'emp-2', status: 'OVERDUE' as const, clinical_status: 'PENDING' as const, due_date: '2026-05-31', approved_document_id: null },
    { employee_id: 'emp-3', status: 'COMPLIANT' as const, clinical_status: 'CRITICAL' as const, due_date: '2026-08-31', approved_document_id: 'doc-3' },
  ];
  const approved = [
    { employee_id: 'emp-1', exam_date: '2025-07-10', cxr_result: 'CLEARED' as const, genexpert_result: 'NOT_DETECTED' as const },
    { employee_id: 'emp-1', exam_date: '2026-06-01', cxr_result: 'CLEARED' as const, genexpert_result: 'NOT_DETECTED' as const },
    { employee_id: 'emp-2', exam_date: '2025-05-12', cxr_result: 'CLEARED' as const, genexpert_result: 'NOT_APPLICABLE' as const },
    { employee_id: 'emp-3', exam_date: '2026-06-02', cxr_result: 'INFILTRATE' as const, genexpert_result: 'DETECTED' as const },
  ];
  const rows = buildApeRows([ANA, BEN, CARLA], records, approved, TODAY);

  it('puts the people who need action first, clear ones last', () => {
    expect(rows.map((r) => [r.fullName, r.bucket])).toEqual([
      ['Ben Cruz', 'OVERDUE'],
      ['Carla Diaz', 'OVERDUE'],
      ['Ana Reyes', 'UP_TO_DATE'],
    ]);
  });

  it('shows the most recent approved exam in ANY cycle, not just this cycle\'s', () => {
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0001')!.lastExamDate).toBe('2026-06-01');
    // Ben is overdue this cycle but did have an exam last year — that is what the registry should still show
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0002')!.lastExamDate).toBe('2025-05-12');
  });

  it('next due: this cycle\'s deadline while open; the following year\'s once cleared', () => {
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0001')!.nextDueDate).toBe('2027-07-31');
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0002')!.nextDueDate).toBe('2026-05-31');
  });

  it('a certificate is available only to someone cleared this cycle with no clinical alert', () => {
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0001')!.certificateAvailable).toBe(true);
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0002')!.certificateAvailable).toBe(false); // not cleared
    expect(rows.find((r) => r.employeeId === 'VMMC-26-0003')!.certificateAvailable).toBe(false); // CRITICAL
  });

  it('someone with no exam on file at all gets NOT_APPLICABLE results and no date, not a crash', () => {
    const [row] = buildApeRows([ANA], [records[1]].map((r) => ({ ...r, employee_id: 'emp-1' })), [], TODAY);
    expect(row.lastExamDate).toBeNull();
    expect(row.cxrResult).toBe('NOT_APPLICABLE');
  });

  it('skips an employee with no current-cycle record (nothing to bucket)', () => {
    expect(buildApeRows([ANA, BEN], [records[0]], approved, TODAY).map((r) => r.fullName)).toEqual(['Ana Reyes']);
  });
});

describe('buildPreEmploymentRows', () => {
  const rows = buildPreEmploymentRows([ANA, BEN, CARLA], [
    { employee_id: 'emp-1', screening_result: 'Cleared', fit_for_duty: true, cleared_at: '2026-08-02T03:53:19Z' },
    { employee_id: 'emp-2', screening_result: 'Awaiting repeat TST', fit_for_duty: false, cleared_at: null },
  ]);

  it('passed -> up to date; recorded but not cleared -> action required; no record -> NO_RECORD (not "overdue")', () => {
    expect(rows.map((r) => [r.fullName, r.bucket, r.hasRecord])).toEqual([
      ['Ben Cruz', 'OVERDUE', true],
      ['Carla Diaz', 'NO_RECORD', false],
      ['Ana Reyes', 'UP_TO_DATE', true],
    ]);
  });

  it('carries the screening text and clearance date through', () => {
    const ana = rows.find((r) => r.fullName === 'Ana Reyes')!;
    expect(ana.screeningResult).toBe('Cleared');
    expect(ana.clearedAt).toBe('2026-08-02T03:53:19Z');
    expect(rows.find((r) => r.fullName === 'Carla Diaz')!.screeningResult).toBeNull();
  });
});

describe('buildPepRows — no exposure is a clear state, an open exposure is not', () => {
  const log = (over: Partial<{ id: string; employee_id: string; exposure_date: string; prophylaxis_status: string; follow_up_date: string | null }>) => ({
    id: 'log-1', employee_id: 'emp-1', exposure_date: '2026-06-10', exposure_type: 'Needlestick injury', prophylaxis_status: 'IN_PROGRESS', follow_up_date: '2026-06-24', ...over,
  });

  it('nobody has logs -> everyone UP_TO_DATE with no latest entry', () => {
    const rows = buildPepRows([ANA, BEN], [], TODAY);
    expect(rows.every((r) => r.bucket === 'UP_TO_DATE' && r.latest === null && r.activeCount === 0)).toBe(true);
  });

  it('an open exposure with a future follow-up -> DUE_SOON (still under surveillance)', () => {
    const [row] = buildPepRows([ANA], [log({})], TODAY);
    expect(row.bucket).toBe('DUE_SOON');
    expect(row.activeCount).toBe(1);
    expect(row.latest).toMatchObject({ id: 'log-1', followUpDate: '2026-06-24' });
  });

  it('an open exposure whose follow-up date has passed -> OVERDUE', () => {
    const [row] = buildPepRows([ANA], [log({ follow_up_date: '2026-06-12' })], TODAY);
    expect(row.bucket).toBe('OVERDUE');
  });

  it('a finished exposure (COMPLETED or DECLINED) no longer counts, even with a past follow-up date', () => {
    expect(buildPepRows([ANA], [log({ prophylaxis_status: 'COMPLETED', follow_up_date: '2026-06-12' })], TODAY)[0]).toMatchObject({ bucket: 'UP_TO_DATE', activeCount: 0 });
    expect(buildPepRows([ANA], [log({ prophylaxis_status: 'DECLINED' })], TODAY)[0].bucket).toBe('UP_TO_DATE');
  });

  it('with several logs the open one decides the row, and among open ones the soonest follow-up', () => {
    const rows = buildPepRows(
      [ANA],
      [
        log({ id: 'old-done', prophylaxis_status: 'COMPLETED', exposure_date: '2026-01-05' }),
        log({ id: 'later', follow_up_date: '2026-07-20' }),
        log({ id: 'sooner', follow_up_date: '2026-06-20' }),
      ],
      TODAY,
    );
    expect(rows[0].latest!.id).toBe('sooner');
    expect(rows[0].activeCount).toBe(2);
  });

  it('with only finished logs, the most recent exposure is shown', () => {
    const [row] = buildPepRows(
      [ANA],
      [
        log({ id: 'a', prophylaxis_status: 'COMPLETED', exposure_date: '2026-01-05' }),
        log({ id: 'b', prophylaxis_status: 'COMPLETED', exposure_date: '2026-04-05' }),
      ],
      TODAY,
    );
    expect(row.latest!.id).toBe('b');
  });

  it('logs belonging to someone who is not in the active list are ignored', () => {
    expect(buildPepRows([ANA], [log({ employee_id: 'former-employee' })], TODAY)[0].latest).toBeNull();
  });
});

describe('buildImmunizationRows', () => {
  const dose = (over: Partial<{ employee_id: string; vaccine_type: string; dose: number; administered_date: string; next_due_date: string | null }>) => ({
    employee_id: 'emp-1', vaccine_type: 'Influenza', dose: 1, administered_date: '2026-04-01', next_due_date: '2026-12-01', ...over,
  });

  it('no doses -> NO_RECORD, not overdue', () => {
    expect(buildImmunizationRows([ANA], [], TODAY)[0]).toMatchObject({ bucket: 'NO_RECORD', latest: null, attention: null, bcgDate: null });
  });

  it('next dose far away -> UP_TO_DATE; within 15 days -> DUE_SOON; passed -> OVERDUE', () => {
    expect(buildImmunizationRows([ANA], [dose({})], TODAY)[0].bucket).toBe('UP_TO_DATE');
    expect(buildImmunizationRows([ANA], [dose({ next_due_date: '2026-06-28' })], TODAY)[0].bucket).toBe('DUE_SOON');
    const overdue = buildImmunizationRows([ANA], [dose({ next_due_date: '2026-06-01' })], TODAY)[0];
    expect(overdue.bucket).toBe('OVERDUE');
    expect(overdue.attention).toMatchObject({ vaccineType: 'Influenza', nextDueDate: '2026-06-01' });
  });

  it('a newer dose of the same vaccine supersedes an old overdue one', () => {
    const rows = buildImmunizationRows(
      [ANA],
      [dose({ dose: 1, administered_date: '2026-01-01', next_due_date: '2026-04-01' }), dose({ dose: 2, administered_date: '2026-05-20', next_due_date: '2026-11-20' })],
      TODAY,
    );
    expect(rows[0].bucket).toBe('UP_TO_DATE');
    expect(rows[0].latest).toMatchObject({ dose: 2 });
  });

  it('a different vaccine that is overdue still counts even when the newest dose is fine', () => {
    const rows = buildImmunizationRows(
      [ANA],
      [dose({ vaccine_type: 'Hepatitis B', administered_date: '2026-02-01', next_due_date: '2026-05-01' }), dose({ vaccine_type: 'Influenza', administered_date: '2026-06-01', next_due_date: '2027-06-01' })],
      TODAY,
    );
    expect(rows[0].bucket).toBe('OVERDUE');
    expect(rows[0].attention!.vaccineType).toBe('Hepatitis B');
    expect(rows[0].latest!.vaccineType).toBe('Influenza');
  });

  it('vaccine names are matched case-insensitively when finding the latest dose per vaccine', () => {
    const rows = buildImmunizationRows(
      [ANA],
      [dose({ vaccine_type: 'influenza', dose: 1, administered_date: '2026-01-01', next_due_date: '2026-03-01' }), dose({ vaccine_type: 'Influenza ', dose: 2, administered_date: '2026-05-01', next_due_date: '2026-11-01' })],
      TODAY,
    );
    expect(rows[0].bucket).toBe('UP_TO_DATE');
  });

  it('a dose with no next-due date never makes anyone overdue; BCG date is picked up', () => {
    const rows = buildImmunizationRows([ANA], [dose({ vaccine_type: 'BCG', next_due_date: null, administered_date: '2020-03-03' })], TODAY);
    expect(rows[0]).toMatchObject({ bucket: 'UP_TO_DATE', bcgDate: '2020-03-03' });
  });

  it('puts overdue people before clear ones, and keeps unrecorded people between them', () => {
    const rows = buildImmunizationRows(
      [ANA, BEN, CARLA],
      [dose({ employee_id: 'emp-1' }), dose({ employee_id: 'emp-3', next_due_date: '2026-05-01' })],
      TODAY,
    );
    expect(rows.map((r) => r.bucket)).toEqual(['OVERDUE', 'NO_RECORD', 'UP_TO_DATE']);
  });
});
