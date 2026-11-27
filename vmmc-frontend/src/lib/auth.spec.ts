import { describe, expect, it } from 'vitest'
import { getInitials, shouldKeepTokenInBrowser, withUserUpdate, type AuthSession } from './auth'

describe('shouldKeepTokenInBrowser (is the token kept in the tab, or left to the HttpOnly cookie?)', () => {
  it('cookie only when the website and the API are on the same host (local development)', () => {
    expect(shouldKeepTokenInBrowser('http://localhost:8443/api', 'localhost')).toBe(false)
  })

  it('cookie only when the API is the website itself (a relative address)', () => {
    expect(shouldKeepTokenInBrowser('/api', 'app.example.com')).toBe(false)
  })

  it('keeps the token in the tab when the site and the API are on different hosts (Vercel plus Railway or Render)', () => {
    expect(shouldKeepTokenInBrowser('https://mne-prod.up.railway.app/api', 'vmmc.vercel.app')).toBe(true)
    expect(shouldKeepTokenInBrowser('https://vmmc-api.onrender.com/api', 'vmmc.vercel.app')).toBe(true)
  })

  it('treats localhost and 127.0.0.1 as different hosts, as a browser does', () => {
    expect(shouldKeepTokenInBrowser('http://localhost:8443/api', '127.0.0.1')).toBe(true)
  })

  it('compares host names, not ports', () => {
    expect(shouldKeepTokenInBrowser('http://localhost:8443/api', 'localhost')).toBe(false)
    expect(shouldKeepTokenInBrowser('https://api.example.com:8443/api', 'api.example.com')).toBe(false)
  })

  it('ignores letter case in host names', () => {
    expect(shouldKeepTokenInBrowser('https://API.Example.com/api', 'api.example.com')).toBe(false)
  })

  it('"cookie" forces cookie-only and "header" forces the tab, whatever the hosts are', () => {
    expect(shouldKeepTokenInBrowser('https://api.example.com/api', 'app.example.com', 'cookie')).toBe(false)
    expect(shouldKeepTokenInBrowser('http://localhost:8443/api', 'localhost', 'header')).toBe(true)
    expect(shouldKeepTokenInBrowser('https://api.example.com/api', 'app.example.com', ' COOKIE ')).toBe(false)
  })

  it('an unknown override value falls back to comparing hosts', () => {
    expect(shouldKeepTokenInBrowser('https://api.example.com/api', 'app.example.com', 'auto')).toBe(true)
    expect(shouldKeepTokenInBrowser('/api', 'app.example.com', '')).toBe(false)
  })

  it('a malformed API address never throws and defaults to the safer cookie mode', () => {
    expect(shouldKeepTokenInBrowser('http://', 'app.example.com')).toBe(false)
  })
})

describe('withUserUpdate', () => {
  const session: AuthSession = {
    accessToken: '',
    expiresAt: 9999999999,
    mustChangePassword: false,
    user: { id: 'u1', employeeId: 'VMMC-25-0024', fullName: 'Test Staff', jobTitle: 'Staff Nurse', email: 'old@example.com', role: 'STAFF', departmentId: 'd1' },
  }

  it('replaces the name and email and leaves every other field alone', () => {
    const next = withUserUpdate(session, { fullName: 'Nurse Edith', email: 'new@example.com' })
    expect(next.user).toEqual({ ...session.user, fullName: 'Nurse Edith', email: 'new@example.com' })
    expect(next.expiresAt).toBe(session.expiresAt)
    expect(next.mustChangePassword).toBe(false)
  })

  it('does not mutate the session it was given', () => {
    withUserUpdate(session, { fullName: 'Nurse Edith' })
    expect(session.user.fullName).toBe('Test Staff')
  })
})

describe('getInitials', () => {
  it('takes the first letter of the first and last name', () => {
    expect(getInitials('Jennie Kim')).toBe('JK')
  })

  it('ignores extra middle names', () => {
    expect(getInitials('John Michael Wick')).toBe('JW')
  })

  it('uppercases lowercase input', () => {
    expect(getInitials('jennie kim')).toBe('JK')
  })

  it('collapses extra whitespace between names', () => {
    expect(getInitials('Jennie   Kim')).toBe('JK')
  })

  it('returns an empty string for empty input', () => {
    expect(getInitials('')).toBe('')
    expect(getInitials('   ')).toBe('')
  })

  it('doubles the first letter for a single-word name (known behavior, not a bug fix)', () => {
    expect(getInitials('Cher')).toBe('CC')
  })

  it('ignores credentials after a comma, so "RN"/"MD" never become the last initial', () => {
    expect(getInitials('Maria Santos, RN')).toBe('MS')
    expect(getInitials('Juan Dela Cruz, RN')).toBe('JC')
    expect(getInitials('Ana Reyes, MD, FPCP')).toBe('AR')
  })
})
