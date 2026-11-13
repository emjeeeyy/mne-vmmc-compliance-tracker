import { ApeSlaSettings, DEFAULT_APE_SLA_SETTINGS, SlaSettingsService } from '../compliance/sla-settings.service';
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

const APPROVED_NEGATIVE = { id: 'doc-1', cxr_result: 'CLEARED', genexpert_result: 'NOT_DETECTED', reviewed_at: '2026-06-09T00:00:00Z' };

function slaSettings(over: Partial<ApeSlaSettings> = {}) {
  return { getApe: jest.fn().mockResolvedValue({ ...DEFAULT_APE_SLA_SETTINGS, ...over }) } as unknown as SlaSettingsService;
}

function buildClassifier(chainResults: { data: unknown; error: unknown }[], sla: Partial<ApeSlaSettings> = {}) {
  const { client, calls } = createSupabaseClientMock(chainResults);
  const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
  const notificationDispatcherService = { handleEvent: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationDispatcherService;
  const classifier = new EventClassifierService(supabaseService, notificationDispatcherService, slaSettings(sla));
  return { classifier, calls, notificationDispatcherService };
}

describe('EventClassifierService.classify', () => {
  it('for an already-COMPLIANT record with nothing positive: reads only, emits and writes nothing, no deadline logic', async () => {
    const { classifier, calls, notificationDispatcherService } = buildClassifier([
      { data: [], error: null }, // existingEvents
      { data: [APPROVED_NEGATIVE], error: null }, // approved documents: one negative
    ]);
    const emitted = await classifier.classify(makeRecord({ status: 'COMPLIANT' }), new Date('2026-07-10')); // even past the deadline
    expect(emitted).toEqual([]);
    expect(calls).toEqual(['events', 'documents']);
    expect(notificationDispatcherService.handleEvent).not.toHaveBeenCalled();
  });

  it('says nothing before the person\'s window opens, even on the very first scan of a record', async () => {
    // Real bug this guards: the first pass used to emit WINDOW_OPENED ("your annual clearance window is now open")
    // for every record, so everyone was told their window was open on the first scan of the year, whatever their
    // real window date was. A November birthday got it in January.
    const { classifier, calls, notificationDispatcherService } = buildClassifier([
      { data: [], error: null }, // existingEvents (none yet: this is the first pass)
      { data: null, error: null }, // approvedDoc (none)
      // today (May 20) is before window_open_date (Jun 1) -> no timeline event either
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-05-20'));
    expect(emitted).toEqual([]);
    expect(notificationDispatcherService.handleEvent).not.toHaveBeenCalled();
    expect(calls).toEqual(['events', 'documents']); // only reads: nothing was inserted
  });

  it('on the first scan after the window has opened, sends just the first reminder (no separate "window open" notice)', async () => {
    const { classifier, notificationDispatcherService } = buildClassifier([
      { data: [], error: null }, // existingEvents (none yet)
      { data: null, error: null }, // approvedDoc (none)
      { data: null, error: null }, // compliance_records update -> NON_COMPLIANT
      { data: EVENT_ROW, error: null }, // emit(FIRST_REMINDER)
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-06-02')); // window opened Jun 1, birthday Jun 15
    expect(emitted).toEqual(['FIRST_REMINDER']);
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
      { data: [{ id: 'doc-1', cxr_result: 'INFILTRATE', genexpert_result: 'NOT_DETECTED', reviewed_at: '2026-06-09T00:00:00Z' }], error: null }, // one positive approved document
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
      { data: [APPROVED_NEGATIVE], error: null }, // negative approved document
      { data: null, error: null }, // compliance_records update -> COMPLIANT
      { data: EVENT_ROW, error: null }, // emit(CLEARANCE_RECORDED)
    ]);
    const emitted = await classifier.classify(makeRecord({ due_date: dueDate }), today);
    expect(emitted).toEqual(['CLEARANCE_RECORDED']);
  });

  it('computes lead_time_days as (due_date - today): positive when cleared early', async () => {
    const { client, calls } = createSupabaseClientMock([
      { data: [{ event_subtype: 'WINDOW_OPENED', detected_at: '2026-06-01T00:00:00Z' }], error: null },
      { data: [APPROVED_NEGATIVE], error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null },
    ]);
    const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
    const notificationDispatcherService = { handleEvent: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationDispatcherService;
    const classifier = new EventClassifierService(supabaseService, notificationDispatcherService, slaSettings());

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

  describe('the weekly reminder follows the stored APE SLA settings (it used to be a hard-coded 7 days)', () => {
    const afterBirthday = [
      { event_subtype: 'BIRTHDAY_DUE', detected_at: '2026-06-15T00:00:00Z' },
    ];

    it('a shorter stored gap sends the reminder sooner: 3 days fires on day 3, not on day 2', async () => {
      const day2 = buildClassifier([{ data: afterBirthday, error: null }, { data: null, error: null }], { weeklyReminderIntervalDays: 3 });
      expect(await day2.classifier.classify(makeRecord(), new Date('2026-06-17'))).toEqual([]);

      const day3 = buildClassifier(
        [{ data: afterBirthday, error: null }, { data: null, error: null }, { data: EVENT_ROW, error: null }],
        { weeklyReminderIntervalDays: 3 },
      );
      expect(await day3.classifier.classify(makeRecord(), new Date('2026-06-18'))).toEqual(['WEEKLY_REMINDER']);
    });

    it('a longer stored gap holds the reminder back: 14 days does not fire on day 8', async () => {
      const day8 = buildClassifier([{ data: afterBirthday, error: null }, { data: null, error: null }], { weeklyReminderIntervalDays: 14 });
      expect(await day8.classifier.classify(makeRecord(), new Date('2026-06-23'))).toEqual([]);
    });

    it('with the weekly reminder switched off nothing is sent, however long it has been', async () => {
      const off = buildClassifier([{ data: afterBirthday, error: null }, { data: null, error: null }], { weeklyReminderEnabled: false });
      expect(await off.classifier.classify(makeRecord(), new Date('2026-06-28'))).toEqual([]);
      expect(off.notificationDispatcherService.handleEvent).not.toHaveBeenCalled();
    });

    it('switching it off does not stop the birthday-day notice', async () => {
      const { classifier } = buildClassifier(
        [
          { data: [], error: null },
          { data: null, error: null },
          { data: null, error: null }, // update -> NON_COMPLIANT
          { data: EVENT_ROW, error: null }, // emit(BIRTHDAY_DUE)
        ],
        { weeklyReminderEnabled: false },
      );
      expect(await classifier.classify(makeRecord(), new Date('2026-06-15'))).toEqual(['BIRTHDAY_DUE']);
    });
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

describe('EventClassifierService.sendManualReminder — admin "Send Reminder"', () => {
  it('records a MANUAL_REMINDER warning event and dispatches it (in-app + SMS + email via the dispatcher)', async () => {
    const { classifier, calls, notificationDispatcherService } = buildClassifier([
      { data: makeRecord({ status: 'OVERDUE' }), error: null }, // the compliance record
      { data: [], error: null }, // no reminder in the last 24h
      { data: { ...EVENT_ROW, event_type: 'WARNING', event_subtype: 'MANUAL_REMINDER' }, error: null }, // event insert
    ]);

    const result = await classifier.sendManualReminder('record-1');

    expect(result.sentAt).toBeTruthy();
    expect(calls).toEqual(['compliance_records', 'events', 'events']);
    expect(notificationDispatcherService.handleEvent).toHaveBeenCalledWith(expect.objectContaining({ event_subtype: 'MANUAL_REMINDER', event_type: 'WARNING' }));
  });

  it('refuses a second reminder within 24 hours (409), without sending anything', async () => {
    const { classifier, notificationDispatcherService } = buildClassifier([
      { data: makeRecord({ status: 'OVERDUE' }), error: null },
      { data: [{ id: 'event-earlier' }], error: null },
    ]);

    await expect(classifier.sendManualReminder('record-1')).rejects.toMatchObject({ status: 409 });
    expect(notificationDispatcherService.handleEvent).not.toHaveBeenCalled();
  });

  it('refuses to remind someone already cleared for the cycle', async () => {
    const { classifier, notificationDispatcherService } = buildClassifier([{ data: makeRecord({ status: 'COMPLIANT' }), error: null }]);

    await expect(classifier.sendManualReminder('record-1')).rejects.toMatchObject({ status: 400 });
    expect(notificationDispatcherService.handleEvent).not.toHaveBeenCalled();
  });

  it('404s for an unknown record', async () => {
    const { classifier } = buildClassifier([{ data: null, error: null }]);

    await expect(classifier.sendManualReminder('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('reports a failure instead of claiming success when the event insert fails', async () => {
    const { classifier, notificationDispatcherService } = buildClassifier([
      { data: makeRecord({ status: 'OVERDUE' }), error: null },
      { data: [], error: null },
      { data: null, error: { message: 'insert failed' } },
    ]);

    await expect(classifier.sendManualReminder('record-1')).rejects.toMatchObject({ status: 400 });
    expect(notificationDispatcherService.handleEvent).not.toHaveBeenCalled();
  });
});

describe('EventClassifierService.classify — a clinical alert for every positive approved document', () => {
  const doc = (id: string, positive: boolean, reviewedAt: string) => ({
    id,
    cxr_result: positive ? 'INFILTRATE' : 'CLEARED',
    genexpert_result: 'NOT_DETECTED',
    reviewed_at: reviewedAt,
  });
  const cleared = () => makeRecord({ status: 'COMPLIANT', clinical_status: 'COMPLIANT' });

  function build(chainResults: { data: unknown; error: unknown }[]) {
    const { client, calls } = createSupabaseClientMock(chainResults);
    const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
    const dispatcher = { handleEvent: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationDispatcherService;
    const classifier = new EventClassifierService(supabaseService, dispatcher, slaSettings());
    return { classifier, client, calls, dispatcher };
  }
  const insertedPayload = (client: { from: jest.Mock }, callIndex: number) =>
    (client.from.mock.results[callIndex].value as { insert: jest.Mock }).insert.mock.calls[0][0].payload;

  it('a positive result approved AFTER the person was cleared raises the alert and marks them Critical (it used to be ignored)', async () => {
    const { classifier, client, calls, dispatcher } = build([
      { data: [], error: null }, // existingEvents: no alert yet
      { data: [doc('d-neg', false, '2026-02-10T00:00:00Z'), doc('d-pos', true, '2026-06-20T00:00:00Z')], error: null },
      { data: null, error: null }, // compliance_records update -> clinical_status CRITICAL
      { data: EVENT_ROW, error: null }, // emit(CLINICAL_ALERT)
    ]);
    const emitted = await classifier.classify(cleared(), new Date('2026-06-21'));
    expect(emitted).toEqual(['CLINICAL_ALERT']);
    expect(calls).toEqual(['events', 'documents', 'compliance_records', 'events']);
    expect(dispatcher.handleEvent).toHaveBeenCalledTimes(1);
    const criticalUpdate = (client.from.mock.results[2].value as { update: jest.Mock }).update.mock.calls[0][0];
    expect(criticalUpdate).toEqual({ clinical_status: 'CRITICAL' }); // clinical only: the deadline status is left alone
    expect(insertedPayload(client, 3)).toEqual({ sourceId: 'd-pos', sourceIds: ['d-pos'] }); // the alert records which document
  });

  it('does not alert twice for the same document (re-running the check changes nothing)', async () => {
    const { classifier, calls } = build([
      { data: [{ event_subtype: 'CLINICAL_ALERT', detected_at: '2026-06-20T01:00:00Z', payload: { sourceId: 'd-pos', sourceIds: ['d-pos'] } }], error: null },
      { data: [doc('d-pos', true, '2026-06-20T00:00:00Z')], error: null },
    ]);
    expect(await classifier.classify(cleared(), new Date('2026-06-21'))).toEqual([]);
    expect(calls).toEqual(['events', 'documents']);
  });

  it('a NEW positive document after an earlier alert alerts again: the first one may already have been dealt with', async () => {
    const { classifier } = build([
      { data: [{ event_subtype: 'CLINICAL_ALERT', detected_at: '2026-03-01T01:00:00Z', payload: { sourceId: 'd-1', sourceIds: ['d-1'] } }], error: null },
      { data: [doc('d-1', true, '2026-03-01T00:00:00Z'), doc('d-2', true, '2026-09-01T00:00:00Z')], error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null },
    ]);
    expect(await classifier.classify(cleared(), new Date('2026-09-02'))).toEqual(['CLINICAL_ALERT']);
  });

  it('alerts sent before they carried document ids still count: they cover documents approved before them, not after', async () => {
    const legacyAlert = { event_subtype: 'CLINICAL_ALERT', detected_at: '2026-08-01T05:00:00Z', payload: null };
    const covered = build([{ data: [legacyAlert], error: null }, { data: [doc('d-1', true, '2026-08-01T04:59:00Z')], error: null }]);
    expect(await covered.classifier.classify(cleared(), new Date('2026-08-02'))).toEqual([]);

    const laterDoc = build([
      { data: [legacyAlert], error: null },
      { data: [doc('d-1', true, '2026-08-01T04:59:00Z'), doc('d-2', true, '2026-08-05T00:00:00Z')], error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null },
    ]);
    expect(await laterDoc.classifier.classify(cleared(), new Date('2026-08-06'))).toEqual(['CLINICAL_ALERT']);
  });

  it('several positive documents found at once (a backlog) raise ONE alert that covers them all, so they are not alerted again', async () => {
    const { classifier, client } = build([
      { data: [], error: null },
      { data: [doc('d-1', true, '2026-04-01T00:00:00Z'), doc('d-2', true, '2026-05-01T00:00:00Z')], error: null },
      { data: null, error: null },
      { data: EVENT_ROW, error: null },
    ]);
    expect(await classifier.classify(cleared(), new Date('2026-06-01'))).toEqual(['CLINICAL_ALERT']);
    expect(insertedPayload(client, 3)).toEqual({ sourceId: 'd-2', sourceIds: ['d-1', 'd-2'] });
  });

  it('an earlier positive that was missed is alerted even when the latest document is negative, and Critical is never downgraded by the clearance', async () => {
    const { classifier, client } = build([
      { data: [], error: null }, // no alert yet
      { data: [doc('d-pos', true, '2026-06-05T00:00:00Z'), doc('d-neg', false, '2026-06-09T00:00:00Z')], error: null },
      { data: null, error: null }, // update -> CRITICAL
      { data: EVENT_ROW, error: null }, // emit(CLINICAL_ALERT)
      { data: null, error: null }, // update -> COMPLIANT (clearance)
      { data: EVENT_ROW, error: null }, // emit(CLEARANCE_RECORDED)
    ]);
    const emitted = await classifier.classify(makeRecord(), new Date('2026-06-10'));
    expect(emitted).toEqual(['CLINICAL_ALERT', 'CLEARANCE_RECORDED']);
    const clearanceUpdate = (client.from.mock.results[4].value as { update: jest.Mock }).update.mock.calls[0][0];
    expect(clearanceUpdate.status).toBe('COMPLIANT');
    expect(clearanceUpdate).not.toHaveProperty('clinical_status'); // would have overwritten the Critical set a moment ago
  });

  it('if the alert could not be recorded it is not reported as sent, so the next scan tries again', async () => {
    const { classifier } = build([
      { data: [], error: null },
      { data: [doc('d-pos', true, '2026-06-20T00:00:00Z')], error: null },
      { data: null, error: null },
      { data: null, error: { message: 'insert failed' } }, // emit(CLINICAL_ALERT) fails
    ]);
    expect(await classifier.classify(cleared(), new Date('2026-06-21'))).toEqual([]);
  });

  it('a cleared person with only negative results is left completely alone, however many documents they have', async () => {
    const { classifier, calls } = build([
      { data: [], error: null },
      { data: [doc('a', false, '2026-02-01T00:00:00Z'), doc('b', false, '2026-04-01T00:00:00Z'), doc('c', false, '2026-06-01T00:00:00Z')], error: null },
    ]);
    expect(await classifier.classify(cleared(), new Date('2026-06-21'))).toEqual([]);
    expect(calls).toEqual(['events', 'documents']);
  });
});
