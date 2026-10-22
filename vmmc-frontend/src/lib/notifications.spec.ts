import { describe, expect, it } from 'vitest'
import { deliverySummary, eventTitle, formatStamp, timeAgo, type NotificationLogEntry } from './notifications'

describe('timeAgo', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')
  it.each([
    ['2026-10-22T11:59:40Z', 'Just now'],
    ['2026-10-22T11:15:00Z', '45m ago'],
    ['2026-10-22T07:00:00Z', '5h ago'],
    ['2026-10-19T12:00:00Z', '3d ago'],
  ])('%s -> %s', (iso, expected) => expect(timeAgo(iso, now)).toBe(expected))
})

const ch = (channel: 'IN_APP' | 'SMS' | 'EMAIL', status: string): NotificationLogEntry['channels'][number] => ({ channel, status, sentAt: null })

describe('deliverySummary — says what really happened, never "sent" for a logged or failed channel', () => {
  it('everything delivered', () => {
    expect(deliverySummary([ch('IN_APP', 'SENT'), ch('SMS', 'SENT'), ch('EMAIL', 'SENT')])).toEqual({ label: 'Sent via In-app, SMS & Email', tone: 'ok' })
  })
  it('in-app only (an informational event) is fine, not a failure', () => {
    expect(deliverySummary([ch('IN_APP', 'SENT')])).toEqual({ label: 'Sent via In-app', tone: 'ok' })
  })
  it('SMS that was only logged (no gateway configured) is called out, not counted as sent', () => {
    expect(deliverySummary([ch('IN_APP', 'SENT'), ch('SMS', 'LOGGED'), ch('EMAIL', 'SENT')])).toEqual({ label: 'Sent via In-app & Email · SMS logged only', tone: 'warn' })
  })
  it('a failed channel makes the whole summary a failure and is named', () => {
    expect(deliverySummary([ch('IN_APP', 'SENT'), ch('SMS', 'LOGGED'), ch('EMAIL', 'FAILED')])).toEqual({ label: 'Sent via In-app · SMS logged only · Email failed', tone: 'bad' })
    expect(deliverySummary([ch('IN_APP', 'SENT'), ch('SMS', 'FAILED'), ch('EMAIL', 'FAILED')]).label).toBe('Sent via In-app · SMS & Email failed')
  })
  it('an unknown status is shown as pending (warn), and no channels at all is "Not dispatched"', () => {
    expect(deliverySummary([ch('EMAIL', 'QUEUED')])).toEqual({ label: 'Email pending', tone: 'warn' })
    expect(deliverySummary([])).toEqual({ label: 'Not dispatched', tone: 'none' })
  })
})

describe('eventTitle', () => {
  it('names every real event subtype', () => {
    expect(eventTitle('SLA_BREACH')).toBe('Overdue Notice: Birth-Month APE')
    expect(eventTitle('WEEKLY_REMINDER')).toBe('Weekly Reminder: Screening Pending')
  })
  it('falls back to a readable name for a subtype added later', () => expect(eventTitle('NEW_THING_HAPPENED')).toBe('New Thing Happened'))
})

describe('formatStamp', () => {
  it("formats in Philippine time regardless of the viewer's zone", () => {
    expect(formatStamp('2026-08-20T06:05:00Z')).toBe('2026-08-20 14:05')
    expect(formatStamp('2026-08-20T17:30:00Z')).toBe('2026-08-21 01:30') // crosses midnight in Manila
  })
})
