import { AdminEmployeeRow, buildAdminBreakdown, buildScreeningProgress, clearanceBucket, FOLLOW_UP_LIMIT } from './dashboard.service';

const TODAY = '2026-06-15';

describe('buildScreeningProgress — the 3 real screening categories, never padded to match a mockup', () => {
  it('all 3 verified -> verifiedCount 3, total always fixed at 3, 100%', () => {
    const result = buildScreeningProgress(
      { status: 'COMPLIANT', due_date: '2026-08-31' },
      { review_status: 'APPROVED' },
      { vaccine_type: 'Flu', quarter: 'Q3', next_due_date: '2026-12-31' },
      TODAY,
    );
    expect(result.total).toBe(3);
    expect(result.verifiedCount).toBe(3);
    expect(result.percent).toBe(100);
    expect(result.items.every((i) => i.status === 'VERIFIED')).toBe(true);
  });

  it('nothing on file at all -> all 3 MISSING, 0%, total still 3 (not shrunk to match available data)', () => {
    const result = buildScreeningProgress(null, null, null, TODAY);
    expect(result.total).toBe(3);
    expect(result.verifiedCount).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.items.map((i) => i.status)).toEqual(['MISSING', 'MISSING', 'MISSING']);
  });

  it('APE: not COMPLIANT -> DUE with a formatted due date, not VERIFIED', () => {
    const result = buildScreeningProgress(
      { status: 'OVERDUE', due_date: '2026-08-31' },
      null,
      null,
      TODAY,
    );
    const ape = result.items.find((i) => i.key === 'APE')!;
    expect(ape.status).toBe('DUE');
    expect(ape.detail).toBe('Due August 31');
  });

  it('Hep B Titer: a row that exists but is not yet APPROVED is DUE ("Pending review"), never VERIFIED', () => {
    const result = buildScreeningProgress(null, { review_status: 'PENDING' }, null, TODAY);
    const titer = result.items.find((i) => i.key === 'HEPB_TITER')!;
    expect(titer.status).toBe('DUE');
    expect(titer.detail).toBe('Pending review');
  });

  it('Hep B Titer: REJECTED also stays DUE, not VERIFIED (only APPROVED counts)', () => {
    const result = buildScreeningProgress(null, { review_status: 'REJECTED' }, null, TODAY);
    const titer = result.items.find((i) => i.key === 'HEPB_TITER')!;
    expect(titer.status).toBe('DUE');
  });

  it('Immunization: a future next_due_date is VERIFIED', () => {
    const result = buildScreeningProgress(
      null,
      null,
      { vaccine_type: 'Flu', quarter: 'Q3', next_due_date: '2026-12-31' },
      TODAY,
    );
    const immunization = result.items.find((i) => i.key === 'IMMUNIZATION')!;
    expect(immunization.status).toBe('VERIFIED');
    expect(immunization.label).toBe('Q3 Flu Immunization');
  });

  it('Immunization: a past next_due_date is DUE, with a formatted date in the detail', () => {
    const result = buildScreeningProgress(
      null,
      null,
      { vaccine_type: 'Flu', quarter: 'Q3', next_due_date: '2026-01-01' },
      TODAY,
    );
    const immunization = result.items.find((i) => i.key === 'IMMUNIZATION')!;
    expect(immunization.status).toBe('DUE');
    expect(immunization.detail).toBe('Due January 1');
  });

  it('Immunization: a dose with no next_due_date at all (one-time, nothing further owed) is VERIFIED', () => {
    const result = buildScreeningProgress(
      null,
      null,
      { vaccine_type: 'Hep B', quarter: null, next_due_date: null },
      TODAY,
    );
    const immunization = result.items.find((i) => i.key === 'IMMUNIZATION')!;
    expect(immunization.status).toBe('VERIFIED');
  });
});

describe('clearanceBucket — admin landing page chart buckets', () => {
  const today = '2026-08-20';
  it('cleared records are up to date regardless of date', () => {
    expect(clearanceBucket({ status: 'COMPLIANT', due_date: '2026-01-31' }, today)).toBe('UP_TO_DATE');
  });
  it('an OVERDUE status, or an uncleared record past its deadline, is overdue', () => {
    expect(clearanceBucket({ status: 'OVERDUE', due_date: '2026-08-31' }, today)).toBe('OVERDUE');
    expect(clearanceBucket({ status: 'NON_COMPLIANT', due_date: '2026-08-19' }, today)).toBe('OVERDUE');
  });
  it('uncleared with the deadline within 15 days (inclusive) is due soon; further out is up to date', () => {
    expect(clearanceBucket({ status: 'NON_COMPLIANT', due_date: '2026-08-20' }, today)).toBe('DUE_SOON');
    expect(clearanceBucket({ status: 'PENDING', due_date: '2026-09-04' }, today)).toBe('DUE_SOON');
    expect(clearanceBucket({ status: 'PENDING', due_date: '2026-09-05' }, today)).toBe('UP_TO_DATE');
  });
});

describe('buildAdminBreakdown — department chart, totals, follow-up list', () => {
  const today = '2026-08-20';
  const employees: AdminEmployeeRow[] = [
    { id: 'e1', employee_id: 'VMMC-1', full_name: 'Ana Cruz', departments: { name: 'Nursing', code: 'NUR' } },
    { id: 'e2', employee_id: 'VMMC-2', full_name: 'Ben Reyes', departments: [{ name: 'Nursing', code: 'NUR' }] },
    { id: 'e3', employee_id: 'VMMC-3', full_name: 'Carlo Diaz', departments: { name: 'Radiology', code: 'RAD' } },
    { id: 'e4', employee_id: 'VMMC-4', full_name: 'Dina Lim', departments: null },
  ];
  const records = [
    { id: 'r1', employee_id: 'e1', status: 'COMPLIANT', due_date: '2026-03-31' },
    { id: 'r2', employee_id: 'e2', status: 'OVERDUE', due_date: '2026-06-30' },
    { id: 'r3', employee_id: 'e3', status: 'OVERDUE', due_date: '2026-05-31' },
    { id: 'r4', employee_id: 'e4', status: 'NON_COMPLIANT', due_date: '2026-08-31' },
    { id: 'r5', employee_id: 'gone', status: 'OVERDUE', due_date: '2026-01-31' }, // inactive employee: ignored
  ];

  it('counts every record into exactly one bucket, skipping records of inactive employees', () => {
    const { clearanceCounts } = buildAdminBreakdown(records, employees, today);
    expect(clearanceCounts).toEqual({ upToDate: 1, dueSoon: 1, overdue: 2 });
  });

  it('groups by department (largest first) and accepts the department join as object or array', () => {
    const { departmentClearance } = buildAdminBreakdown(records, employees, today);
    expect(departmentClearance[0]).toEqual({ name: 'Nursing', code: 'NUR', upToDate: 1, dueSoon: 0, overdue: 1 });
    expect(departmentClearance.map((d) => d.name)).toEqual(['Nursing', 'Radiology', 'Unassigned']);
  });

  it('lists overdue personnel, most overdue first, with their department and module', () => {
    const { followUps, followUpTotal } = buildAdminBreakdown(records, employees, today);
    expect(followUpTotal).toBe(2);
    expect(followUps.map((f) => f.fullName)).toEqual(['Carlo Diaz', 'Ben Reyes']);
    expect(followUps[0]).toMatchObject({ recordId: 'r3', employeeId: 'VMMC-3', department: 'Radiology', module: 'APE Exam', dueDate: '2026-05-31' });
  });

  it('caps the follow-up list but reports the true total', () => {
    const many = Array.from({ length: FOLLOW_UP_LIMIT + 5 }, (_, i) => ({ id: `x${i}`, employee_id: 'e2', status: 'OVERDUE', due_date: '2026-06-30' }));
    const { followUps, followUpTotal } = buildAdminBreakdown(many, employees, today);
    expect(followUps).toHaveLength(FOLLOW_UP_LIMIT);
    expect(followUpTotal).toBe(FOLLOW_UP_LIMIT + 5);
  });
});
