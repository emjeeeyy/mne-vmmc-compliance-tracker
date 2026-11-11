import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { DEFAULT_APE_SLA_SETTINGS, parseApeSlaSettings, SlaSettingsService } from './sla-settings.service';

describe('parseApeSlaSettings — what the stored row means in code', () => {
  it('reads all three settings from a complete row (numeric target may arrive as a string)', () => {
    expect(parseApeSlaSettings({ weekly_reminder: false, weekly_reminder_interval_days: 3, target_rate: '0.9' })).toEqual({
      weeklyReminderEnabled: false,
      weeklyReminderIntervalDays: 3,
      targetPercent: 90,
    });
  });

  it('the shipped row (14 / weekly on / 0.95, no interval column yet) behaves exactly as the code did before', () => {
    expect(parseApeSlaSettings({ weekly_reminder: true, target_rate: 0.95 })).toEqual(DEFAULT_APE_SLA_SETTINGS);
  });

  it('falls back to the default for anything missing or out of range instead of throwing', () => {
    expect(parseApeSlaSettings(null)).toEqual(DEFAULT_APE_SLA_SETTINGS);
    expect(parseApeSlaSettings({})).toEqual(DEFAULT_APE_SLA_SETTINGS);
    for (const bad of [0, -3, 2.5, 91, 'soon', null]) {
      expect(parseApeSlaSettings({ weekly_reminder_interval_days: bad as never }).weeklyReminderIntervalDays).toBe(7);
    }
    for (const bad of [0, -1, 1.5, 95, 'x', null]) {
      expect(parseApeSlaSettings({ target_rate: bad as never }).targetPercent).toBe(95);
    }
  });

  it('accepts the edges: a 1-day and a 90-day gap, a 100% target', () => {
    expect(parseApeSlaSettings({ weekly_reminder_interval_days: 1 }).weeklyReminderIntervalDays).toBe(1);
    expect(parseApeSlaSettings({ weekly_reminder_interval_days: 90 }).weeklyReminderIntervalDays).toBe(90);
    expect(parseApeSlaSettings({ target_rate: 1 }).targetPercent).toBe(100);
  });
});

describe('SlaSettingsService.getApe', () => {
  const build = (results: { data: unknown; error: unknown }[]) => {
    const { client, calls } = createSupabaseClientMock(results);
    const service = new SlaSettingsService({ getClient: jest.fn(() => client) } as unknown as SupabaseService);
    return { service, calls };
  };

  it('reads the APE row and returns its settings', async () => {
    const { service } = build([{ data: { weekly_reminder: true, weekly_reminder_interval_days: 5, target_rate: 0.9 }, error: null }]);
    await expect(service.getApe()).resolves.toEqual({ weeklyReminderEnabled: true, weeklyReminderIntervalDays: 5, targetPercent: 90 });
  });

  it('a backend deployed before the interval migration still works: it retries without that column and keeps the default gap', async () => {
    const { service, calls } = build([
      { data: null, error: { message: 'column sla_definitions.weekly_reminder_interval_days does not exist' } },
      { data: { weekly_reminder: false, target_rate: 0.9 }, error: null },
    ]);
    await expect(service.getApe()).resolves.toEqual({ weeklyReminderEnabled: false, weeklyReminderIntervalDays: 7, targetPercent: 90 });
    expect(calls).toEqual(['sla_definitions', 'sla_definitions']);
  });

  it('uses the defaults, and does not throw, when there is no active APE row or the table cannot be read', async () => {
    const none = build([{ data: null, error: null }]);
    await expect(none.service.getApe()).resolves.toEqual(DEFAULT_APE_SLA_SETTINGS);
    const broken = build([{ data: null, error: { message: 'down' } }, { data: null, error: { message: 'down' } }]);
    await expect(broken.service.getApe()).resolves.toEqual(DEFAULT_APE_SLA_SETTINGS);
  });

  it('reads the database at most once a minute, and picks up a change after that', async () => {
    const { service, calls } = build([
      { data: { weekly_reminder: true, weekly_reminder_interval_days: 7, target_rate: 0.95 }, error: null },
      { data: { weekly_reminder: true, weekly_reminder_interval_days: 2, target_rate: 0.95 }, error: null },
    ]);
    const t0 = 1_000_000;
    expect((await service.getApe(t0)).weeklyReminderIntervalDays).toBe(7);
    expect((await service.getApe(t0 + 59_000)).weeklyReminderIntervalDays).toBe(7); // cached: no second query
    expect(calls).toHaveLength(1);
    expect((await service.getApe(t0 + 61_000)).weeklyReminderIntervalDays).toBe(2); // refreshed
    expect(calls).toHaveLength(2);
  });
});
