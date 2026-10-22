import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { LogRow, NotificationLogService, toLogEntries } from './notification-log.service';

const row = (over: Partial<LogRow> = {}): LogRow => ({
  id: 'ev-1',
  event_type: 'EXCEPTION',
  event_subtype: 'SLA_BREACH',
  severity: 2,
  message: 'Birth-month deadline passed with no approved clearance.',
  detected_at: '2026-08-20T14:05:00Z',
  employees: { employee_id: 'VMMC-24-0006', full_name: 'Ana Garcia', departments: { name: 'OPD Nursing' } },
  notifications: [
    { channel: 'EMAIL', status: 'SENT', sent_at: '2026-08-20T14:05:02Z', created_at: '2026-08-20T14:05:02Z' },
    { channel: 'IN_APP', status: 'SENT', sent_at: '2026-08-20T14:05:00Z', created_at: '2026-08-20T14:05:00Z' },
    { channel: 'SMS', status: 'LOGGED', sent_at: '2026-08-20T14:05:01Z', created_at: '2026-08-20T14:05:01Z' },
  ],
  ...over,
});

describe('toLogEntries', () => {
  it('maps an event with its employee, department and every channel outcome', () => {
    const [entry] = toLogEntries([row()]);
    expect(entry).toMatchObject({
      id: 'ev-1',
      eventType: 'EXCEPTION',
      eventSubtype: 'SLA_BREACH',
      detectedAt: '2026-08-20T14:05:00Z',
      employee: { employeeId: 'VMMC-24-0006', fullName: 'Ana Garcia', department: 'OPD Nursing' },
    });
  });

  it('lists channels in a fixed order (in-app, SMS, email) however the rows came back, keeping the real status', () => {
    const [entry] = toLogEntries([row()]);
    expect(entry.channels.map((c) => [c.channel, c.status])).toEqual([
      ['IN_APP', 'SENT'],
      ['SMS', 'LOGGED'],
      ['EMAIL', 'SENT'],
    ]);
  });

  it('an in-app-only event (informational) has just the in-app channel', () => {
    const [entry] = toLogEntries([row({ event_type: 'INFORMATIONAL', event_subtype: 'WINDOW_OPENED', notifications: [{ channel: 'IN_APP', status: 'SENT', sent_at: null }] })]);
    expect(entry.channels).toEqual([{ channel: 'IN_APP', status: 'SENT', sentAt: null }]);
  });

  it('a retried channel shows only its latest attempt', () => {
    const [entry] = toLogEntries([
      row({
        notifications: [
          { channel: 'EMAIL', status: 'FAILED', sent_at: null, created_at: '2026-08-20T14:05:00Z' },
          { channel: 'EMAIL', status: 'SENT', sent_at: '2026-08-20T14:10:00Z', created_at: '2026-08-20T14:10:00Z' },
        ],
      }),
    ]);
    expect(entry.channels).toEqual([{ channel: 'EMAIL', status: 'SENT', sentAt: '2026-08-20T14:10:00Z' }]);
  });

  it('copes with array embeds, a missing employee/department, and no notification rows at all', () => {
    const [a, b] = toLogEntries([
      row({ employees: [{ employee_id: 'VMMC-24-0007', full_name: 'Carlos Bautista', departments: [{ name: 'Radiology' }] }] }),
      row({ id: 'ev-2', employees: null, notifications: null }),
    ]);
    expect(a.employee).toEqual({ employeeId: 'VMMC-24-0007', fullName: 'Carlos Bautista', department: 'Radiology' });
    expect(b.employee).toEqual({ employeeId: '—', fullName: 'Unknown employee', department: 'Unassigned' });
    expect(b.channels).toEqual([]);
  });
});

describe('NotificationLogService.getLog', () => {
  function build(data: unknown, error: unknown = null) {
    const { client } = createSupabaseClientMock([{ data, error }]);
    const service = new NotificationLogService({ getClient: jest.fn(() => client) } as unknown as SupabaseService);
    return { service, client };
  }

  it('returns the mapped rows, newest first, from the events table', async () => {
    const { service, client } = build([row()]);
    const result = await service.getLog(10);
    expect(result).toHaveLength(1);
    expect(client.from).toHaveBeenCalledWith('events');
  });

  it('clamps the limit to 1..100 so one request cannot pull the whole table', async () => {
    const mock = createSupabaseClientMock([{ data: [], error: null }, { data: [], error: null }]);
    const service = new NotificationLogService({ getClient: jest.fn(() => mock.client) } as unknown as SupabaseService);
    await service.getLog(5000);
    await service.getLog(0);
    const chains = mock.client.from.mock.results.map((r) => r.value as { limit: jest.Mock });
    expect(chains[0].limit).toHaveBeenCalledWith(100);
    expect(chains[1].limit).toHaveBeenCalledWith(1);
  });

  it('an empty table is an empty list, and a database error is thrown (not swallowed)', async () => {
    await expect(build(null).service.getLog()).resolves.toEqual([]);
    await expect(build(null, { message: 'boom' }).service.getLog()).rejects.toMatchObject({ message: 'boom' });
  });
});
