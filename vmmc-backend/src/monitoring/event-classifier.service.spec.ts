import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { EventClassifierService } from './event-classifier.service';
import { ComplianceRecordRow } from './types';

function makeRecord(overrides: Partial<ComplianceRecordRow> = {}): ComplianceRecordRow {
  return {
    id: 'record-1',
    employee_id: 'employee-1',
    cycle_year: 2026,
    birthday_date: '2026-06-15',
    window_open_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'PENDING',
    clinical_status: 'PENDING',
    ...overrides,
  };
}

const EVENT_ROW = {
  id: 'event-1',
  employee_id: 'employee-1',
  compliance_record_id: 'record-1',
  event_type: 'INFORMATIONAL',
  event_subtype: 'WHATEVER',
  severity: 0,
  message: 'x',
  detected_at: new Date().toISOString(),
};

function buildClassifier(chainResults: { data: unknown; error: unknown }[]) {
  const { client, calls } = createSupabaseClientMock(chainResults);
  const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
  const notificationDispatcherService = { handleEvent: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationDispatcherService;
  const classifier = new EventClassifierService(supabaseService, notificationDispatcherService);
  return { classifier, calls, notificationDispatcherService };
}

describe('EventClassifierService.classify', () => {
  it('is a no-op for an already-COMPLIANT record (does not touch the database at all)', async () => {
    const { classifier, calls } = buildClassifier([]);
    const emitted = await classifier.classify(makeRecord({ status: 'COMPLIANT' }), new Date('2026-06-10'));
    expect(emitted).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('emits WINDOW_OPENED exactly once, on the very first pass for a record', async () => {
    const { classifier, notificationDispatcherService } = buildClassifier([
      { data: [], error: null }, // existingEvents (none yet)
      { data: EVENT_ROW, error: null }, // emit(WINDOW_OPENED) insert
      { data: null, error: null }, // approvedDoc (none)
      // today (May 20) is before window_open_date (Jun 1) -> no timeline event
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-05-20'));
    expect(emitted).toEqual(['WINDOW_OPENED']);
    expect(notificationDispatcherService.handleEvent).toHaveBeenCalledTimes(1);
  });

  it('emits FIRST_REMINDER once the window has opened, and sets status to NON_COMPLIANT', async () => {
    const { classifier } = buildClassifier([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: null, error: null }, // approvedDoc
      { data: null, error: null }, // compliance_records update -> NON_COMPLIANT
      { data: EVENT_ROW, error: null }, // emit(FIRST_REMINDER)
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-06-10')); // window open, before birthday
    expect(emitted).toEqual(['FIRST_REMINDER']);
  });

  it('emits BIRTHDAY_DUE (Warning) on/after the birthday with no submission', async () => {
    const { classifier } = buildClassifier([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: null, error: null },
      { data: null, error: null }, // update -> NON_COMPLIANT
      { data: EVENT_ROW, error: null }, // emit(BIRTHDAY_DUE)
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-06-15')); // exactly the birthday
    expect(emitted).toEqual(['BIRTHDAY_DUE']);
  });

  it('emits SLA_BREACH (Exception) once the birth-month deadline has passed with no clearance', async () => {
    const { classifier } = buildClassifier([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: null, error: null }, // approvedDoc
      { data: null, error: null }, // update -> OVERDUE
      { data: EVENT_ROW, error: null }, // emit(SLA_BREACH)
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-07-05')); // past due_date (Jun 30)
    expect(emitted).toEqual(['SLA_BREACH']);
  });

  it('emits CLINICAL_ALERT (Exception) when the approved document is a positive result', async () => {
    const { classifier } = buildClassifier([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: { id: 'doc-1', cxr_result: 'INFILTRATE', genexpert_result: 'NOT_DETECTED' }, error: null }, // positive approvedDoc
      { data: null, error: null }, // compliance_records update -> clinical_status CRITICAL
      { data: EVENT_ROW, error: null }, // emit(CLINICAL_ALERT)
      // today is also within the window (before birthday) -> FIRST_REMINDER also fires,
      // proving the clinical and timeline dimensions are independent (§ "on-time yet CRITICAL").
      { data: null, error: null }, // compliance_records update -> NON_COMPLIANT
      { data: EVENT_ROW, error: null }, // emit(FIRST_REMINDER)
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-06-10'));
    expect(emitted).toEqual(['CLINICAL_ALERT', 'FIRST_REMINDER']);
  });

  it('emits CLEARANCE_RECORDED for a negative result and stops — no timeline event fires even if overdue', async () => {
    const dueDate = '2026-06-30';
    const today = new Date('2026-07-10'); // 10 days AFTER the deadline
    const { classifier } = buildClassifier([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: { id: 'doc-1', cxr_result: 'CLEARED', genexpert_result: 'NOT_DETECTED' }, error: null }, // negative approvedDoc
      { data: null, error: null }, // compliance_records update -> COMPLIANT
      { data: EVENT_ROW, error: null }, // emit(CLEARANCE_RECORDED)
    ]);
    const emitted = await classifier.classify(makeRecord({ due_date: dueDate }), today);
    expect(emitted).toEqual(['CLEARANCE_RECORDED']);
  });

  it('computes lead_time_days as (due_date - today): positive when cleared early', async () => {
    const { client, calls } = createSupabaseClientMock([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: { id: 'doc-1', cxr_result: 'CLEARED', genexpert_result: 'NOT_DETECTED' }, error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null },
    ]);
    const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
    const notificationDispatcherService = { handleEvent: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationDispatcherService;
    const classifier = new EventClassifierService(supabaseService, notificationDispatcherService);

    // due_date is June 30; clearing on June 20 is 10 days early -> lead_time_days should be 10.
    await classifier.classify(makeRecord({ due_date: '2026-06-30' }), new Date('2026-06-20'));

    // The 3rd .from() call in this sequence is the compliance_records update — inspect what
    // `.update()` was called with via the chain object returned for that call.
    const complianceRecordsChain = client.from.mock.results[2].value;
    const updateCallArg = complianceRecordsChain.update.mock.calls[0][0];
    expect(updateCallArg.lead_time_days).toBe(10);
    expect(calls[2]).toBe('compliance_records');
  });

  it('de-dupes: re-running classify() after every subtype already exists emits nothing and writes nothing', async () => {
    const existingEvents = [
      { event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' },
      { event_subtype: 'SLA_BREACH', detected_at: '2026-07-01T00:00:00Z' },
    ];
    const { classifier, calls } = buildClassifier([
      { data: existingEvents, error: null },
      { data: null, error: null }, // approvedDoc
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-07-05'));
    expect(emitted).toEqual([]);
    expect(calls).toEqual(['events', 'documents']); // no compliance_records update, no events insert
  });

  it('sends WEEKLY_REMINDER once 7+ days have passed since the last reminder, and not before', async () => {
    const existingEvents = [
      { event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' },
      { event_subtype: 'BIRTHDAY_DUE', detected_at: '2026-06-15T00:00:00Z' },
    ];

    // 3 days later — too soon, no reminder.
    const tooSoon = buildClassifier([
      { data: existingEvents, error: null },
      { data: null, error: null },
    ]);
    const emittedTooSoon = await tooSoon.classifier.classify(makeRecord(), new Date('2026-06-18'));
    expect(emittedTooSoon).toEqual([]);

    // 8 days later — due for another reminder.
    const dueForReminder = buildClassifier([
      { data: existingEvents, error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null }, // emit(WEEKLY_REMINDER)
    ]);
    const emitted = await dueForReminder.classifier.classify(makeRecord(), new Date('2026-06-23'));
    expect(emitted).toEqual(['WEEKLY_REMINDER']);
  });

  it('emits THREE_MONTH_HR_NOTICE once the employee is still non-compliant three months after birthday', async () => {
    const existingEvents = [
      { event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' },
      { event_subtype: 'BIRTHDAY_DUE', detected_at: '2026-06-15T00:00:00Z' },
      { event_subtype: 'SLA_BREACH', detected_at: '2026-07-05T00:00:00Z' },
    ];

    const { classifier } = buildClassifier([
      { data: existingEvents, error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null }, // emit(THREE_MONTH_HR_NOTICE)
    ]);

    const emitted = await classifier.classify(makeRecord(), new Date('2026-09-15'));
    expect(emitted).toEqual(['THREE_MONTH_HR_NOTICE']);
  });
});

describe('EventClassifierService — PEP / Immunization overdue classification', () => {
  it('classifyPepFollowUp emits once and is de-duped by payload.sourceId on a repeat scan', async () => {
    const pepLog = {
      id: 'pep-1',
      employee_id: 'employee-1',
      exposure_date: '2026-07-01',
      exposure_type: 'Needlestick injury',
      prophylaxis_status: 'PENDING',
      follow_up_date: '2026-07-15',
      notes: null,
    };

    const firstPass = buildClassifier([
      { data: null, error: null }, // hasSourceEvent -> not found
      { data: EVENT_ROW, error: null }, // emitOther insert
    ]);
    expect(await firstPass.classifier.classifyPepFollowUp(pepLog)).toBe(true);

    const secondPass = buildClassifier([
      { data: { id: 'event-existing' }, error: null }, // hasSourceEvent -> already exists
    ]);
    expect(await secondPass.classifier.classifyPepFollowUp(pepLog)).toBe(false);
    expect(secondPass.calls).toEqual(['events']); // no insert attempted
  });

  it('classifyImmunizationOverdue emits once and is de-duped the same way', async () => {
    const dose = {
      id: 'dose-1',
      employee_id: 'employee-1',
      vaccine_type: 'Hepatitis B',
      dose: 1,
      administered_date: '2026-04-01',
      next_due_date: '2026-07-01',
      quarter: 'Q2',
    };

    const firstPass = buildClassifier([
      { data: null, error: null },
      { data: EVENT_ROW, error: null },
    ]);
    expect(await firstPass.classifier.classifyImmunizationOverdue(dose)).toBe(true);

    const secondPass = buildClassifier([{ data: { id: 'event-existing' }, error: null }]);
    expect(await secondPass.classifier.classifyImmunizationOverdue(dose)).toBe(false);
  });
});
