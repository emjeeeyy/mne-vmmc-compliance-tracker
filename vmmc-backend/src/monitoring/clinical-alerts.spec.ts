import { ApprovedDocument, ClinicalAlertEvent, documentsNeedingClinicalAlert, isPositiveResult } from './clinical-alerts';

const doc = (id: string, cxr: string, gx: string, reviewedAt: string | null = '2026-06-10T00:00:00Z'): ApprovedDocument => ({
  id, cxr_result: cxr, genexpert_result: gx, reviewed_at: reviewedAt,
});

describe('isPositiveResult', () => {
  it('is positive for an infiltrate X-ray or a detected GeneXpert, and only those', () => {
    expect(isPositiveResult({ cxr_result: 'INFILTRATE', genexpert_result: 'NOT_APPLICABLE' })).toBe(true);
    expect(isPositiveResult({ cxr_result: 'NOT_APPLICABLE', genexpert_result: 'DETECTED' })).toBe(true);
    expect(isPositiveResult({ cxr_result: 'CLEARED', genexpert_result: 'NOT_DETECTED' })).toBe(false);
    expect(isPositiveResult({ cxr_result: 'PENDING', genexpert_result: 'NOT_APPLICABLE' })).toBe(false);
  });
});

describe('documentsNeedingClinicalAlert', () => {
  const positive = doc('p1', 'INFILTRATE', 'NOT_APPLICABLE');
  const negative = doc('n1', 'CLEARED', 'NOT_APPLICABLE');

  it('a positive document with no alert needs one; a negative one never does', () => {
    expect(documentsNeedingClinicalAlert([positive, negative], [])).toEqual([positive]);
  });

  it('an alert that names the document covers it, and only it', () => {
    const other = doc('p2', 'NOT_APPLICABLE', 'DETECTED');
    const alerts: ClinicalAlertEvent[] = [{ detected_at: '2026-06-10T01:00:00Z', payload: { sourceId: 'p1', sourceIds: ['p1'] } }];
    expect(documentsNeedingClinicalAlert([positive, other], alerts)).toEqual([other]);
  });

  it('one alert can name several documents (a backlog raised together)', () => {
    const other = doc('p2', 'NOT_APPLICABLE', 'DETECTED');
    const alerts: ClinicalAlertEvent[] = [{ detected_at: '2026-06-10T01:00:00Z', payload: { sourceId: 'p2', sourceIds: ['p1', 'p2'] } }];
    expect(documentsNeedingClinicalAlert([positive, other], alerts)).toEqual([]);
  });

  it('an alert without document ids (every alert sent so far) covers documents approved before it was sent', () => {
    const legacy: ClinicalAlertEvent[] = [{ detected_at: '2026-06-10T00:00:30Z', payload: null }];
    expect(documentsNeedingClinicalAlert([positive], legacy)).toEqual([]); // approved 00:00:00, alerted 00:00:30
    expect(documentsNeedingClinicalAlert([doc('late', 'INFILTRATE', 'NOT_APPLICABLE', '2026-06-11T00:00:00Z')], legacy)).toHaveLength(1);
  });

  it('compares real instants, not text, so differently formatted timestamps still line up', () => {
    const legacy: ClinicalAlertEvent[] = [{ detected_at: '2026-06-10T08:00:00.123456+08:00', payload: {} }]; // = 00:00:00.123Z
    expect(documentsNeedingClinicalAlert([doc('p', 'INFILTRATE', 'NOT_APPLICABLE', '2026-06-10T00:00:00Z')], legacy)).toEqual([]);
  });

  it('a legacy alert cannot cover a document that has no approval time', () => {
    const legacy: ClinicalAlertEvent[] = [{ detected_at: '2026-06-10T00:00:30Z', payload: null }];
    expect(documentsNeedingClinicalAlert([doc('x', 'INFILTRATE', 'NOT_APPLICABLE', null)], legacy)).toHaveLength(1);
  });
});
