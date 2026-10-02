import { AuditLogRow, dedupeBursts, isNoise } from './activity.service';

function row(action: string, entityType: string, isoTime: string): AuditLogRow {
  return { action, entity_type: entityType, ip_address: '::1', user_agent: null, timestamp: isoTime };
}

describe('isNoise', () => {
  it('suppresses ACCESS on background panel-population entity types', () => {
    // Real bug this guards: refreshMyChangeRequests() fires unconditionally on every
    // Profile.tsx mount to populate the "Request a Change" history panel — a user who
    // never touched that panel still saw "Accessed Change Request" in their feed.
    expect(isNoise(row('ACCESS', 'change-requests', '2026-10-02T00:00:00Z'))).toBe(true);
    expect(isNoise(row('ACCESS', 'me-notifications', '2026-10-02T00:00:00Z'))).toBe(true);
    expect(isNoise(row('ACCESS', 'me-devices', '2026-10-02T00:00:00Z'))).toBe(true);
    expect(isNoise(row('ACCESS', 'me-privacy-settings', '2026-10-02T00:00:00Z'))).toBe(true);
    expect(isNoise(row('ACCESS', 'departments', '2026-10-02T00:00:00Z'))).toBe(true);
  });

  it('never suppresses a real mutation, even on a noise-listed entity type', () => {
    // Real bug this guards: an earlier version of this filter excluded the whole
    // entity_type regardless of action, which silently hid genuine user actions —
    // removing a registered device, toggling a privacy setting, submitting or
    // approving a change request. Nothing in this app auto-mutates without a click,
    // so CREATE/UPDATE/DELETE must always stay visible regardless of entity_type.
    expect(isNoise(row('DELETE', 'me-devices', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('UPDATE', 'me-privacy-settings', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('CREATE', 'change-requests', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('UPDATE', 'change-requests', '2026-10-02T00:00:00Z'))).toBe(false);
  });

  it('never suppresses a real page visit like /me/profile', () => {
    // Unlike the entries above, /me/profile is only ever fetched from Profile.tsx's
    // own mount — a genuine 1:1 "the user navigated here" signal, not a background
    // read fired incidentally from every page or every panel.
    expect(isNoise(row('ACCESS', 'me-profile', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('ACCESS', 'dashboard', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('ACCESS', 'compliance', '2026-10-02T00:00:00Z'))).toBe(false);
  });

  it('never suppresses LOGIN/LOGIN_FAILED/ACCESS_DENIED', () => {
    expect(isNoise(row('LOGIN', 'auth', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('LOGIN_FAILED', 'auth', '2026-10-02T00:00:00Z'))).toBe(false);
    expect(isNoise(row('ACCESS_DENIED', 'documents', '2026-10-02T00:00:00Z'))).toBe(false);
  });
});

describe('dedupeBursts', () => {
  it('collapses a tight burst of the same (action, entity_type) into one, keeping the newest', () => {
    // Real shape seen live: Profile.tsx firing /me/profile twice ~0.3s apart (React 18
    // Strict Mode double-invoking the mount effect in dev) — same signature, same burst.
    const rows = [
      row('ACCESS', 'me-profile', '2026-10-02T03:35:52.253Z'),
      row('ACCESS', 'me-profile', '2026-10-02T03:35:51.901Z'),
    ];
    expect(dedupeBursts(rows)).toEqual([row('ACCESS', 'me-profile', '2026-10-02T03:35:52.253Z')]);
  });

  it('keeps two visits to the same page minutes apart as two separate entries', () => {
    const rows = [
      row('ACCESS', 'dashboard', '2026-10-02T09:00:00.000Z'),
      row('ACCESS', 'dashboard', '2026-10-02T08:00:00.000Z'),
    ];
    expect(dedupeBursts(rows)).toHaveLength(2);
  });

  it('does not merge different entity_types that happen to land close together', () => {
    // A real Profile-page visit: /me/profile and /change-requests/mine fire together,
    // both meaningful on their own, should both survive.
    const rows = [
      row('ACCESS', 'change-requests', '2026-10-02T03:42:18.012Z'),
      row('ACCESS', 'me-profile', '2026-10-02T03:42:17.849Z'),
    ];
    expect(dedupeBursts(rows)).toHaveLength(2);
  });

  it('does not merge different actions on the same entity_type, even back to back', () => {
    // A failed login immediately followed by a successful one is two real, distinct
    // events — must never collapse into one regardless of how close in time.
    const rows = [row('LOGIN', 'auth', '2026-10-02T03:35:50.814Z'), row('LOGIN_FAILED', 'auth', '2026-10-02T03:35:50.636Z')];
    expect(dedupeBursts(rows)).toHaveLength(2);
  });

  it('merges a slow-drifting burst as long as no single gap exceeds the window', () => {
    // Five same-signature rows each ~900ms apart span 3.6s total — longer than the
    // window itself — but every individual gap is under it, so this is still one
    // continuous burst, not artificially split at the 3s mark.
    const rows = [
      row('ACCESS', 'me-profile', '2026-10-02T00:00:03.600Z'),
      row('ACCESS', 'me-profile', '2026-10-02T00:00:02.700Z'),
      row('ACCESS', 'me-profile', '2026-10-02T00:00:01.800Z'),
      row('ACCESS', 'me-profile', '2026-10-02T00:00:00.900Z'),
      row('ACCESS', 'me-profile', '2026-10-02T00:00:00.000Z'),
    ];
    expect(dedupeBursts(rows)).toEqual([row('ACCESS', 'me-profile', '2026-10-02T00:00:03.600Z')]);
  });

  it('treats a null entity_type as its own consistent signature rather than throwing', () => {
    const rows = [row('ACCESS', null as unknown as string, '2026-10-02T00:00:00.500Z'), row('ACCESS', null as unknown as string, '2026-10-02T00:00:00.000Z')];
    expect(dedupeBursts(rows)).toHaveLength(1);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeBursts([])).toEqual([]);
  });
});
