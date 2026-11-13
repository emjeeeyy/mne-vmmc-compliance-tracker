import { describe, expect, it } from 'vitest'
import { clampPage, cxrText, exposureDay, filterRows, genexpertText, longDate, matchesSearch, monthYear, type RegistryBucket, type RegistryPerson } from './registry'

const person = (over: Partial<RegistryPerson> & { bucket?: RegistryBucket } = {}) => ({
  id: 'e1',
  employeeId: 'VMMC-21-0012',
  fullName: 'Dr. Roberto Santos',
  jobTitle: 'Consultant Pulmonologist',
  department: { name: 'Pulmonology / TB DOTS', code: 'PULM' },
  bucket: 'UP_TO_DATE' as RegistryBucket,
  ...over,
})

describe('matchesSearch — name, Employee ID or department, case-insensitive', () => {
  const row = person()
  it.each(['roberto', 'ROBERTO', 'vmmc-21', '0012', 'pulmonology', 'pulm'])('matches "%s"', (q) => expect(matchesSearch(row, q)).toBe(true))
  it('an empty or blank search matches everyone', () => {
    expect(matchesSearch(row, '')).toBe(true)
    expect(matchesSearch(row, '   ')).toBe(true)
  })
  it('does not match unrelated text, and does not search the job title', () => {
    expect(matchesSearch(row, 'radiology')).toBe(false)
    expect(matchesSearch(row, 'consultant')).toBe(false)
  })
})

describe('filterRows', () => {
  const rows = [
    person({ id: '1', fullName: 'Ana Reyes', bucket: 'OVERDUE' }),
    person({ id: '2', fullName: 'Ben Cruz', bucket: 'UP_TO_DATE', department: { name: 'Radiology', code: 'RAD' } }),
    person({ id: '3', fullName: 'Carla Diaz', bucket: 'NO_RECORD' }),
  ]
  it('ALL keeps every status', () => expect(filterRows(rows, '', 'ALL')).toHaveLength(3))
  it('narrows to one status', () => expect(filterRows(rows, '', 'OVERDUE').map((r) => r.id)).toEqual(['1']))
  it('NO_RECORD is its own status, not folded into overdue', () => expect(filterRows(rows, '', 'NO_RECORD').map((r) => r.id)).toEqual(['3']))
  it('combines search and status', () => {
    expect(filterRows(rows, 'radiology', 'ALL').map((r) => r.id)).toEqual(['2'])
    expect(filterRows(rows, 'radiology', 'OVERDUE')).toEqual([])
  })
})

describe('result wording — never claims a result that was not reported', () => {
  it('chest x-ray', () => {
    expect(cxrText('CLEARED', true)).toBe('Cleared')
    expect(cxrText('INFILTRATE', true)).toBe('Infiltrate noted')
    expect(cxrText('PENDING', true)).toBe('Result pending')
    expect(cxrText('NOT_APPLICABLE', true)).toBe('Not reported')
    expect(cxrText('NOT_APPLICABLE', false)).toBe('No exam on file')
  })
  it('GeneXpert', () => {
    expect(genexpertText('NOT_DETECTED', true)).toBe('MTB Not Detected')
    expect(genexpertText('DETECTED', true)).toBe('MTB Detected')
    expect(genexpertText('NOT_APPLICABLE', true)).toBe('N/A')
    expect(genexpertText('NOT_APPLICABLE', false)).toBe('—')
  })
})

describe('exposureDay', () => {
  const today = new Date(2026, 5, 15) // 15 Jun 2026, local
  it('counts the exposure day as Day 1', () => {
    expect(exposureDay('2026-06-15', today)).toBe(1)
    expect(exposureDay('2026-06-13', today)).toBe(3)
  })
  it('never goes below Day 1 for a future-dated entry', () => expect(exposureDay('2026-07-01', today)).toBe(1))
})

describe('date formatting is timezone-stable', () => {
  it('monthYear reads a month-end date in that month, not the next', () => expect(monthYear('2026-08-31')).toBe('Aug 2026'))
  it('longDate formats a plain date and a timestamp', () => {
    expect(longDate('2026-09-05')).toBe('September 5, 2026')
    expect(longDate('2026-09-05T08:30:00Z')).toBe('September 5, 2026')
  })
})

describe('clampPage', () => {
  it('stays put when the page still exists', () => expect(clampPage(1, 25, 10)).toBe(1))
  it('falls back to the last page when a new search leaves fewer rows', () => expect(clampPage(4, 12, 10)).toBe(1))
  it('is page 0 when there are no rows', () => expect(clampPage(3, 0, 10)).toBe(0))
})
