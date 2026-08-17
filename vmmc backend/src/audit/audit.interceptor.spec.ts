import { deriveEntityType } from './audit.interceptor';

describe('deriveEntityType', () => {
  it('uses the module segment for most routes', () => {
    expect(deriveEntityType('/api/compliance/tracker')).toBe('compliance');
    expect(deriveEntityType('/api/documents')).toBe('documents');
    expect(deriveEntityType('/api/review-queue')).toBe('review-queue');
  });

  it('splits the me module by its sub-resource instead of collapsing everything to "me"', () => {
    expect(deriveEntityType('/api/me/profile')).toBe('me-profile');
    expect(deriveEntityType('/api/me/activity-logs')).toBe('me-activity-logs');
    expect(deriveEntityType('/api/me/devices')).toBe('me-devices');
    expect(deriveEntityType('/api/me/devices/9f2c1e3a-...')).toBe('me-devices');
    expect(deriveEntityType('/api/me/login-history')).toBe('me-login-history');
    expect(deriveEntityType('/api/me/security/pin')).toBe('me-security');
  });

  it('falls back to "me" for a bare /me path with no sub-resource', () => {
    expect(deriveEntityType('/api/me')).toBe('me');
  });

  it('falls back to "unknown" for a bare /api path', () => {
    expect(deriveEntityType('/api')).toBe('unknown');
  });
});
