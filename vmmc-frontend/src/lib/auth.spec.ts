import { describe, expect, it } from 'vitest'
import { getInitials, withUserUpdate, type AuthSession } from './auth'

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
