import { describe, expect, it } from 'vitest'
import { DEFAULT_TARGET_PERCENT, reminderCadenceLabel, targetStatus } from './compliance-target'

describe('targetStatus', () => {
  it('says the target is met at or above it', () => {
    expect(targetStatus(95, 95)).toEqual({ met: true, gap: 0, text: 'Target met' })
    expect(targetStatus(100, 95).met).toBe(true)
  })
  it('counts the points still to go, singular and plural', () => {
    expect(targetStatus(94, 95)).toEqual({ met: false, gap: 1, text: '1 point below target' })
    expect(targetStatus(82, 95)).toEqual({ met: false, gap: 13, text: '13 points below target' })
  })
  it('follows the stored target, not a fixed 95', () => {
    expect(targetStatus(90, 90).met).toBe(true)
    expect(targetStatus(90, 99).text).toBe('9 points below target')
  })
  it('the fallback is the 95 the screens used to show', () => expect(DEFAULT_TARGET_PERCENT).toBe(95))
})

describe('reminderCadenceLabel', () => {
  it('keeps the familiar wording for the default weekly cadence, and when an older backend sends nothing', () => {
    expect(reminderCadenceLabel({ enabled: true, intervalDays: 7 })).toBe('Reminders dispatch weekly')
    expect(reminderCadenceLabel(undefined)).toBe('Reminders dispatch weekly')
    expect(reminderCadenceLabel(null)).toBe('Reminders dispatch weekly')
  })
  it('does not say "weekly" when it is not', () => {
    expect(reminderCadenceLabel({ enabled: true, intervalDays: 3 })).toBe('Reminders every 3 days')
    expect(reminderCadenceLabel({ enabled: true, intervalDays: 1 })).toBe('Reminders dispatch daily')
    expect(reminderCadenceLabel({ enabled: true, intervalDays: 14 })).toBe('Reminders every 14 days')
  })
  it('says so when weekly reminders are switched off', () => {
    expect(reminderCadenceLabel({ enabled: false, intervalDays: 7 })).toBe('Weekly reminders are off')
  })
})
