import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { ActorRow, AuditTrailService, buildTrail, TrailRow } from './audit-trail.service';

const ANA = { id: 'u-ana', employee_id: 'VMMC-24-0006', full_name: 'Ana Garcia', job_title: 'Staff Nurse', role: 'STAFF' as const };
const BEN = { id: 'u-ben', employee_id: 'VMMC-25-0022', full_name: 'Ben Cruz', job_title: 'TB DOTS Lead', role: 'ADMIN' as const };
const actors = new Map<string, ActorRow>([[ANA.id, ANA], [BEN.id, BEN]]);

const row = (over: Partial<TrailRow>): TrailRow => ({
  actor_id: ANA.id,
  action: 'ACCESS',
  entity_type: 'documents',
  entity_id: '3f2a9c10-1111-4222-8333-444455556666',
  ip_address: '10.0.0.1',
  user_agent: 'jest',
  timestamp: '2026-10-22T08:00:00.000Z',
  ...over,
});

describe('buildTrail', () => {
  it('shapes a row with its actor, raw action code, entity and a short reference', () => {
    const [entry] = buildTrail([row({})], actors, 10);
    expect(entry).toEqual({
      time: '2026-10-22T08:00:00.000Z',
      title: 'Accessed Laboratory Documents',
      action: 'ACCESS',
      entityType: 'documents',
      entityRef: '3F2A9C',
      actor: { employeeId: 'VMMC-24-0006', fullName: 'Ana Garcia', role: 'STAFF', jobTitle: 'Staff Nurse' },
    });
  });

  it('drops the background page-load reads that would flood a system-wide feed', () => {
    const rows = [
      row({ entity_type: 'me-notifications', timestamp: '2026-10-22T08:00:05.000Z' }),
      row({ entity_type: 'audit-trail', timestamp: '2026-10-22T08:00:04.000Z' }),
      row({ entity_type: 'documents', timestamp: '2026-10-22T08:00:03.000Z' }),
    ];
    expect(buildTrail(rows, actors, 10).map((e) => e.entityType)).toEqual(['documents']);
  });

  it('keeps real writes even on a noise entity type (only ACCESS reads are noise)', () => {
    expect(buildTrail([row({ action: 'DELETE', entity_type: 'me-devices' })], actors, 10)).toHaveLength(1);
  });

  it('merges a burst per person, but two different people doing the same thing at once are both kept', () => {
    const rows = [
      row({ actor_id: ANA.id, timestamp: '2026-10-22T08:00:01.000Z' }),
      row({ actor_id: ANA.id, timestamp: '2026-10-22T08:00:00.500Z' }),
      row({ actor_id: BEN.id, timestamp: '2026-10-22T08:00:00.900Z' }),
    ];
    const trail = buildTrail(rows, actors, 10);
    expect(trail.map((e) => e.actor?.employeeId)).toEqual(['VMMC-24-0006', 'VMMC-25-0022']);
  });

  it('a row with no signed-in actor (or one that no longer exists) has a null actor instead of crashing', () => {
    const trail = buildTrail([row({ actor_id: null, action: 'LOGIN_FAILED', entity_type: 'auth' }), row({ actor_id: 'gone', timestamp: '2026-10-21T08:00:00.000Z', entity_type: 'reports' })], actors, 10);
    expect(trail.map((e) => e.actor)).toEqual([null, null]);
  });

  it('respects the limit after filtering, newest first', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ entity_type: `t${i}`, timestamp: `2026-10-22T08:0${9 - i}:00.000Z` }));
    expect(buildTrail(rows, actors, 3).map((e) => e.entityType)).toEqual(['t0', 't1', 't2']);
  });
});

describe('AuditTrailService.list', () => {
  it('reads the log, looks up only the actors seen, and clamps the limit', async () => {
    const mock = createSupabaseClientMock([
      { data: [row({}), row({ actor_id: BEN.id, entity_type: 'registry', timestamp: '2026-10-22T07:00:00.000Z' })], error: null },
      { data: [ANA, BEN], error: null },
    ]);
    const service = new AuditTrailService({ getClient: jest.fn(() => mock.client) } as unknown as SupabaseService);
    const result = await service.list(9999);
    expect(result).toHaveLength(2);
    expect(mock.calls).toEqual(['audit_logs', 'employees']);
    const logChain = mock.client.from.mock.results[0].value as { limit: jest.Mock };
    expect(logChain.limit).toHaveBeenCalledWith(50 * 6); // clamped to 50, over-fetched 6x
  });

  it('skips the employee lookup when nobody is signed in on any row, and an empty log is an empty list', async () => {
    const mock = createSupabaseClientMock([{ data: [row({ actor_id: null, action: 'LOGIN_FAILED', entity_type: 'auth' })], error: null }]);
    const service = new AuditTrailService({ getClient: jest.fn(() => mock.client) } as unknown as SupabaseService);
    expect(await service.list(5)).toHaveLength(1);
    expect(mock.calls).toEqual(['audit_logs']);
    const empty = createSupabaseClientMock([{ data: null, error: null }]);
    expect(await new AuditTrailService({ getClient: jest.fn(() => empty.client) } as unknown as SupabaseService).list()).toEqual([]);
  });

  it('a database error is thrown, not swallowed', async () => {
    const mock = createSupabaseClientMock([{ data: null, error: { message: 'boom' } }]);
    await expect(new AuditTrailService({ getClient: jest.fn(() => mock.client) } as unknown as SupabaseService).list()).rejects.toMatchObject({ message: 'boom' });
  });
});
