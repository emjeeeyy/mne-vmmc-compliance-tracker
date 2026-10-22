export interface NotificationItem {
  id: string
  status: string
  sentAt: string | null
  createdAt: string
  eventType: 'INFORMATIONAL' | 'WARNING' | 'EXCEPTION'
  eventSubtype: string
  severity: number
  message: string
}

export function notificationStyle(eventType: NotificationItem['eventType']) {
  if (eventType === 'EXCEPTION') return { bg: '#fff5f5', border: '#feb2b2', color: '#c53030' }
  if (eventType === 'WARNING') return { bg: '#fffbea', border: '#f6e05e', color: '#b7791f' }
  return { bg: '#e6f9ee', border: '#9ae6b4', color: '#008d46' }
}

/** Plain-words name for each kind of notification, so the kind is never carried by color alone. */
export const NOTIFICATION_KIND: Record<NotificationItem['eventType'], { label: string; bg: string; fg: string }> = {
  EXCEPTION: { label: 'Alert', bg: '#ffe0e3', fg: '#b42318' },
  WARNING: { label: 'Reminder', bg: '#fff0bd', fg: '#764000' },
  INFORMATIONAL: { label: 'Update', bg: '#dff3e6', fg: '#00643a' },
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---- Admin notification log (GET /notifications/log) -------------------------------------------------------

export type LogChannel = 'IN_APP' | 'SMS' | 'EMAIL'

export interface NotificationLogEntry {
  id: string
  eventType: NotificationItem['eventType']
  eventSubtype: string
  severity: number
  message: string
  detectedAt: string
  employee: { employeeId: string; fullName: string; department: string }
  channels: { channel: LogChannel; status: string; sentAt: string | null }[]
}

const EVENT_TITLE: Record<string, string> = {
  WINDOW_OPENED: 'Clearance Window Opened',
  CLEARANCE_RECORDED: 'Clearance Recorded',
  FIRST_REMINDER: 'First Reminder: Screening Window Open',
  BIRTHDAY_DUE: 'Birthday Reminder: Clearance Due',
  WEEKLY_REMINDER: 'Weekly Reminder: Screening Pending',
  SLA_BREACH: 'Overdue Notice: Birth-Month APE',
  THREE_MONTH_HR_NOTICE: '3-Month Overdue Notice (HR)',
  CLINICAL_ALERT: 'Clinical Alert: Result Needs Review',
  PEP_FOLLOWUP_MISSED: 'Missed PEP Follow-up',
  IMMUNIZATION_OVERDUE: 'Immunization Dose Overdue',
  DOCUMENT_REJECTED: 'Document Needs Re-upload',
  MANUAL_REMINDER: 'Manual Reminder from the TB DOTS Unit',
}

export function eventTitle(subtype: string): string {
  return EVENT_TITLE[subtype] ?? subtype.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

const CHANNEL_NAME: Record<LogChannel, string> = { IN_APP: 'In-app', SMS: 'SMS', EMAIL: 'Email' }

function joinNames(channels: LogChannel[]): string {
  const names = channels.map((c) => CHANNEL_NAME[c])
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

export type DeliveryTone = 'ok' | 'warn' | 'bad' | 'none'

/** What actually happened to a dispatched event, in words. The mockup's pill says "Sent via SMS & Email", but the
 * system's real outcomes include SMS that was only logged (no gateway key configured) and email that failed, and
 * saying "sent" for those would be false. */
export function deliverySummary(channels: NotificationLogEntry['channels']): { label: string; tone: DeliveryTone } {
  if (channels.length === 0) return { label: 'Not dispatched', tone: 'none' }
  const by = (status: string) => channels.filter((c) => c.status === status).map((c) => c.channel)
  const sent = by('SENT')
  const logged = by('LOGGED')
  const failed = by('FAILED')
  const other = channels.filter((c) => !['SENT', 'LOGGED', 'FAILED'].includes(c.status)).map((c) => c.channel)
  const parts: string[] = []
  if (sent.length) parts.push(`Sent via ${joinNames(sent)}`)
  if (logged.length) parts.push(`${joinNames(logged)} logged only`)
  if (failed.length) parts.push(`${joinNames(failed)} failed`)
  if (other.length) parts.push(`${joinNames(other)} pending`)
  return { label: parts.join(' · '), tone: failed.length ? 'bad' : logged.length || other.length ? 'warn' : 'ok' }
}

/** "2026-10-19 16:00", in Philippine time (the hospital's clock), whatever the viewer's own time zone. */
export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
