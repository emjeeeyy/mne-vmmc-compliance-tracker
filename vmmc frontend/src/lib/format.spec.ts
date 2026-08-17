import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateAge, formatBirthDate, formatFullDate, formatLogTime, toCsv } from './format'

describe('formatFullDate', () => {
  it('formats an ISO date as a long-form UTC date, regardless of local timezone', () => {
    expect(formatFullDate('2026-08-31')).toBe('August 31, 2026')
  })
})

describe('formatLogTime', () => {
  // Uses the local timezone (unlike formatFullDate), so only the shape is asserted here —
  // exact wall-clock time depends on where this test happens to run.
  it('formats as "MON DD, YYYY • H:MM AM/PM" in uppercase', () => {
    expect(formatLogTime('2026-05-27T23:10:00Z')).toMatch(/^[A-Z]{3} \d{1,2}, \d{4} • \d{1,2}:\d{2} (AM|PM)$/)
  })
})

describe('formatBirthDate', () => {
  it('formats an ISO date as a long-form date', () => {
    expect(formatBirthDate('2004-08-23')).toBe('August 23, 2004')
  })

  it('returns an empty string for an empty input', () => {
    expect(formatBirthDate('')).toBe('')
  })
})

describe('calculateAge', () => {
  // "Today" is pinned so this doesn't depend on the real calendar date (a real-date version of
  // this test would break every December, when "this month + 1" rolls over into next year).
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 12)) // August 12, 2026
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty string for an empty input', () => {
    expect(calculateAge('')).toBe('')
  })

  it('counts a full year once the birthday has passed this year', () => {
    expect(calculateAge('1996-07-01')).toBe('30') // birthday was last month
  })

  it('does not count this year until the birthday actually occurs', () => {
    expect(calculateAge('1996-09-01')).toBe('29') // birthday is next month
  })

  it('counts the birthday itself as already turned', () => {
    expect(calculateAge('1996-08-12')).toBe('30') // birthday is today
  })

  it('handles a leap-year birthday (Feb 29) without throwing', () => {
    expect(calculateAge('2000-02-29')).toBe('26')
  })
})

describe('toCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  it('builds an unquoted header row from the first row\'s keys, with quoted data cells', () => {
    const csv = toCsv([{ name: 'Jennie Kim', role: 'STAFF' }])
    expect(csv).toBe('name,role\n"Jennie Kim","STAFF"')
  })

  it('escapes embedded quotes in data cells', () => {
    const csv = toCsv([{ note: 'Says "hi", waves' }])
    expect(csv).toBe('note\n"Says ""hi"", waves"')
  })

  it('renders null/undefined values as empty strings, not "null"/"undefined"', () => {
    const csv = toCsv([{ value: null }, { value: undefined }])
    expect(csv).toBe('value\n""\n""')
  })
})
