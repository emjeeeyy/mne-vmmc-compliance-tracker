import { describe, expect, it } from 'vitest'
import { getInitials } from './auth'

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
})
