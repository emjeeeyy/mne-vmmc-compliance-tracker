'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Bell, Check, List, MessageCircle, RefreshCw, Send, Siren } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { getPreciseRole } from '@/lib/auth'
import { deliverySummary, eventTitle, formatStamp, NOTIFICATION_KIND, timeAgo, type DeliveryTone, type NotificationItem, type NotificationLogEntry } from '@/lib/notifications'

interface Escalation {
  id: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  breachDurationDays: number | null
  createdAt: string
  event: { type: string; subtype: string; message: string }
  employee: { id: string; employeeId: string; fullName: string }
}

const GREEN = '#006042'
const LOG_PAGE = 10
type KindFilter = 'ALL' | NotificationItem['eventType']
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'EXCEPTION', label: 'Alerts' },
  { key: 'WARNING', label: 'Reminders' },
  { key: 'INFORMATIONAL', label: 'Updates' },
]

/** The three tiers the monitoring engine really has (event types INFORMATIONAL / WARNING / EXCEPTION). The mockup's
 * wording was corrected to the real schedule: the window opens 14 days before the birthday, reminders then run on the
 * birthday and weekly, and the deadline is the end of the birth month. There is no mobile push channel. */
const TIERS: { tag: string; tagBg: string; tagFg: string; iconBg: string; icon: ReactNode; title: string; body: string }[] = [
  { tag: '1. ROUTINE NOTICE', tagBg: '#dff3e6', tagFg: '#00643a', iconBg: '#e3f3e9', icon: <Bell size={20} color="#00703f" fill="#00703f" aria-hidden="true" />, title: 'Clearance Window Opens', body: 'Logged in the app when a staff member’s yearly screening window opens, 14 days before their birthday. It needs no response, so it isn’t texted or emailed.' },
  { tag: '2. FRIENDLY REMINDER', tagBg: '#fff0bd', tagFg: '#764000', iconBg: '#fff0d6', icon: <MessageCircle size={20} color="#c2410c" aria-hidden="true" />, title: 'Reminders Until Cleared', body: 'A first reminder when the window opens, one on the birthday, then weekly until the exam is approved. Sent in-app, by SMS and by email.' },
  { tag: '3. OVERDUE ALERT', tagBg: '#ffe0e3', tagFg: '#b42318', iconBg: '#ffe4e6', icon: <AlertTriangle size={20} color="#b42318" fill="#b42318" aria-hidden="true" />, title: 'Overdue Clearance Alert', body: 'Sent when the end-of-birth-month deadline passes with no approved clearance, and it also opens an escalation to the Department Head.' },
]

const TONE: Record<DeliveryTone, { bg: string; fg: string }> = {
  ok: { bg: '#eaeef3', fg: '#475569' },
  warn: { bg: '#fff0bd', fg: '#764000' },
  bad: { bg: '#ffe0e3', fg: '#b42318' },
  none: { bg: '#eaeef3', fg: '#475569' },
}

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow or unavailable. Please try again.'
  return fallback
}

const fullStamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function Card({ children, index, label }: { children: ReactNode; index: number; label?: string }) {
  return (
    <motion.section custom={index} variants={fadeRise} initial="hidden" animate="visible" aria-label={label}
      style={{ background: '#fff', borderRadius: 18, padding: 'clamp(18px, 1.6vw, 28px)', boxShadow: '0 4px 8px rgba(15,23,42,0.14)', marginTop: 22 }}
    >
      {children}
    </motion.section>
  )
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: `1.5px solid ${pressed ? GREEN : '#d5dce6'}`, background: pressed ? GREEN : '#fff', color: pressed ? '#fff' : '#1f3151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

function KindTag({ type }: { type: NotificationItem['eventType'] }) {
  const k = NOTIFICATION_KIND[type] ?? NOTIFICATION_KIND.INFORMATIONAL
  return <span style={{ display: 'inline-block', background: k.bg, color: k.fg, borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{k.label}</span>
}

function EscalationRow({ esc, busy, onAct }: { esc: Escalation; busy: boolean; onAct: (id: string, action: 'acknowledge' | 'resolve') => void }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '16px 0', borderTop: '1px solid #eef1f5' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{esc.employee.fullName}</strong>
          <span style={{ fontSize: 13, color: '#5f6b7d' }}>{esc.employee.employeeId}</span>
        </div>
        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, margin: '4px 0 0' }}>{esc.event.message}</p>
        <div style={{ fontSize: 13, color: '#5f6b7d', marginTop: 4 }}>
          <time dateTime={esc.createdAt} title={fullStamp(esc.createdAt)}>{timeAgo(esc.createdAt)}</time>
          {esc.breachDurationDays ? ` · ${esc.breachDurationDays} day${esc.breachDurationDays === 1 ? '' : 's'} past the deadline` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {esc.status === 'ACKNOWLEDGED' && <span style={{ background: '#fff0bd', color: '#764000', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Acknowledged</span>}
        {esc.status === 'RESOLVED' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dff3e6', color: '#00643a', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}><Check size={15} aria-hidden="true" /> Resolved</span>}
        {esc.status === 'OPEN' && (
          <button type="button" onClick={() => onAct(esc.id, 'acknowledge')} disabled={busy} aria-label={`Acknowledge escalation for ${esc.employee.fullName}`}
            style={{ minHeight: 40, padding: '0 18px', border: 'none', borderRadius: 10, background: '#1b2230', color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            Acknowledge
          </button>
        )}
        {esc.status !== 'RESOLVED' && (
          <button type="button" onClick={() => onAct(esc.id, 'resolve')} disabled={busy} aria-label={`Mark escalation for ${esc.employee.fullName} as resolved`}
            style={{ minHeight: 40, padding: '0 18px', border: 'none', borderRadius: 10, background: '#008541', color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            Mark Resolved
          </button>
        )}
      </div>
    </li>
  )
}

/** The admin's "Notification & Screening Reminder Engine": what the engine sends, and a log of what it actually sent. */
function DispatchLog() {
  const [entries, setEntries] = useState<NotificationLogEntry[] | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [shown, setShown] = useState(LOG_PAGE)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      setEntries((await api.get<NotificationLogEntry[]>('/notifications/log?limit=50')) ?? [])
    } catch (err) {
      setError(apiMessage(err, 'Could not load the notification log.'))
      setEntries((prev) => prev ?? [])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <Card index={2} label="Notification dispatch log">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', paddingBottom: 14, borderBottom: '1px solid #eef1f5' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
            <List size={18} color="#4b5563" aria-hidden="true" /> Notification Dispatch Log
          </h2>
          <p style={{ fontSize: 13, color: '#55667e', margin: '3px 0 0 28px' }}>Reminders and alerts the system has sent to staff, most recent first, with what happened on each channel</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={refreshing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', border: 'none', background: 'none', color: '#00643a', fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 700, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.7 : 1 }}
        >
          <RefreshCw size={17} aria-hidden="true" /> {refreshing ? 'Refreshing…' : 'Refresh Log'}
        </button>
      </div>

      {error && <p role="alert" style={{ fontSize: 14, fontWeight: 600, color: '#b42318', margin: '14px 0 0' }}>{error}</p>}
      {entries === null && <p role="status" style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>Loading…</p>}
      {entries !== null && entries.length === 0 && !error && <p style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>Nothing has been sent yet. Run a compliance scan from the Modules Registry to generate reminders.</p>}

      {entries !== null && entries.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.slice(0, shown).map((e) => {
            const delivery = deliverySummary(e.channels)
            const tone = TONE[delivery.tone]
            return (
              <li key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 16, border: '1px solid #e5e9f0', borderRadius: 14, padding: '14px 18px' }}>
                <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: '#eef1f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Bell size={17} color="#64748b" fill="#64748b" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{eventTitle(e.eventSubtype)}</div>
                  <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2, lineHeight: 1.45 }}>{e.employee.fullName} ({e.employee.employeeId}): {e.message}</div>
                  <time dateTime={e.detectedAt} style={{ display: 'block', fontSize: 12, color: '#5f6b7d', marginTop: 4 }}>{formatStamp(e.detectedAt)}</time>
                </div>
                <span style={{ alignSelf: 'flex-start', maxWidth: 260, background: tone.bg, color: tone.fg, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.35, textAlign: 'center', flexShrink: 0 }}>{delivery.label}</span>
              </li>
            )
          })}
        </ul>
      )}

      {entries !== null && entries.length > shown && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 18 }}>
          <span style={{ fontSize: 13, color: '#55667e' }}>Showing {shown} of {entries.length}</span>
          <button type="button" onClick={() => setShown((n) => n + LOG_PAGE)} style={{ minHeight: 40, padding: '0 20px', border: '1px solid #d5dce6', borderRadius: 10, background: '#fff', color: '#1f3151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Show more</button>
        </div>
      )}
    </Card>
  )
}

/** Notification center. Everyone sees the notifications sent to them; the TB DOTS admin sees the reminder engine
 * (what it sends and a log of what it sent) and the escalations raised across the hospital. */
export default function Notifications() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [itemsError, setItemsError] = useState('')
  const [escalations, setEscalations] = useState<Escalation[] | null>(null)
  const [escError, setEscError] = useState('')
  const [escView, setEscView] = useState<'open' | 'resolved'>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [kind, setKind] = useState<KindFilter>('ALL')

  useEffect(() => { setIsAdmin(getPreciseRole() === 'ADMIN') }, [])

  useEffect(() => {
    api.get<NotificationItem[]>('/me/notifications').then((d) => setItems(d ?? [])).catch((e) => { setItems([]); setItemsError(apiMessage(e, 'Could not load your notifications.')) })
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    api.get<Escalation[]>('/escalations').then((d) => setEscalations(d ?? [])).catch((e) => { setEscalations([]); setEscError(apiMessage(e, 'Could not load escalations.')) })
  }, [isAdmin])

  const act = async (id: string, action: 'acknowledge' | 'resolve') => {
    setBusyId(id)
    setEscError('')
    try {
      await api.patch(`/escalations/${id}/${action}`)
      setEscalations((prev) => (prev ?? []).map((e) => (e.id === id ? { ...e, status: action === 'resolve' ? 'RESOLVED' : 'ACKNOWLEDGED' } : e)))
    } catch (err) {
      setEscError(apiMessage(err, 'That update could not be saved. Please try again.'))
    } finally {
      setBusyId(null)
    }
  }

  const openEsc = useMemo(() => (escalations ?? []).filter((e) => e.status !== 'RESOLVED'), [escalations])
  const resolvedEsc = useMemo(() => (escalations ?? []).filter((e) => e.status === 'RESOLVED'), [escalations])
  const shownEsc = escView === 'open' ? openEsc : resolvedEsc
  const shownItems = (items ?? []).filter((n) => kind === 'ALL' || n.eventType === kind)

  return (
    <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12 sm:px-6 lg:px-[4vw]" style={{ paddingTop: 'clamp(0px, 2.3vw, 44px)', fontFamily: 'Poppins,sans-serif' }}>
      <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 18, padding: 'clamp(20px, 1.8vw, 30px) clamp(20px, 2vw, 34px)', boxShadow: '0 4px 8px rgba(15,23,42,0.2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 14px 0 11px', borderRadius: 999, background: isAdmin ? '#fef2c0' : '#dff3e6', color: isAdmin ? '#841f00' : '#00522f', fontSize: 12, fontWeight: 600 }}>
          {isAdmin ? <Send size={14} strokeWidth={2.4} aria-hidden="true" /> : <Bell size={14} strokeWidth={2.4} aria-hidden="true" />}
          {isAdmin ? 'Automated Health Notifications' : 'Notification Center'}
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: '14px 0 0' }}>{isAdmin ? 'Notification & Screening Reminder Engine' : 'Notifications'}</h1>
        <p style={{ fontSize: 13, color: '#55667e', lineHeight: 1.5, margin: '4px 0 0' }}>
          {isAdmin
            ? 'Automated reminders sent by in-app notice, SMS and email, based on each employee’s birth-month schedule and screening due dates.'
            : 'Reminders and updates sent to you about your health clearance.'}
        </p>
      </motion.div>

      {isAdmin && (
        <>
          <motion.ul custom={1} variants={fadeRise} initial="hidden" animate="visible" aria-label="How notifications are sent"
            style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'grid', gap: 'clamp(14px, 1.3vw, 22px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}
          >
            {TIERS.map((t) => (
              <li key={t.tag} style={{ background: '#fff', borderRadius: 16, padding: '18px 20px 20px', boxShadow: '0 2px 8px rgba(15,23,42,0.12)', border: '1px solid #e5e9f0' }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</span>
                <span style={{ display: 'inline-block', marginTop: 14, background: t.tagBg, color: t.tagFg, borderRadius: 5, padding: '3px 9px', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em' }}>{t.tag}</span>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: '6px 0 0' }}>{t.title}</h2>
                <p style={{ fontSize: 13, color: '#55667e', lineHeight: 1.5, margin: '6px 0 0' }}>{t.body}</p>
              </li>
            ))}
          </motion.ul>

          <DispatchLog />

          <Card index={3}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                <Siren size={20} color="#b42318" aria-hidden="true" /> Escalations Requiring Attention
              </h2>
              <div role="group" aria-label="Show escalations" style={{ display: 'flex', gap: 8 }}>
                <Chip pressed={escView === 'open'} onClick={() => setEscView('open')}>Open ({openEsc.length})</Chip>
                <Chip pressed={escView === 'resolved'} onClick={() => setEscView('resolved')}>Resolved ({resolvedEsc.length})</Chip>
              </div>
            </div>
            {escError && <p role="alert" style={{ fontSize: 14, fontWeight: 600, color: '#b42318', margin: '12px 0 0' }}>{escError}</p>}
            {escalations === null && <p role="status" style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>Loading…</p>}
            {escalations !== null && shownEsc.length === 0 && !escError && (
              <p style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>{escView === 'open' ? 'No open escalations — nothing needs your action right now.' : 'No resolved escalations yet.'}</p>
            )}
            {shownEsc.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
                {shownEsc.map((e) => <EscalationRow key={e.id} esc={e} busy={busyId === e.id} onAct={act} />)}
              </ul>
            )}
          </Card>
        </>
      )}

      <Card index={4}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{isAdmin ? 'My Notifications' : 'Your Notifications'}</h2>
          <div role="group" aria-label="Filter notifications by kind" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {KIND_FILTERS.map((f) => <Chip key={f.key} pressed={kind === f.key} onClick={() => setKind(f.key)}>{f.label}</Chip>)}
          </div>
        </div>
        {itemsError && <p role="alert" style={{ fontSize: 14, fontWeight: 600, color: '#b42318', margin: '12px 0 0' }}>{itemsError}</p>}
        {items === null && <p role="status" style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>Loading…</p>}
        {items !== null && shownItems.length === 0 && !itemsError && (
          <p style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>{items.length === 0 ? 'No notifications yet.' : 'No notifications of this kind.'}</p>
        )}
        {shownItems.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
            {shownItems.map((n) => (
              <li key={n.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '16px 0', borderTop: '1px solid #eef1f5' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <KindTag type={n.eventType} />
                  <p style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.55, margin: '6px 0 0' }}>{n.message}</p>
                </div>
                <time dateTime={n.createdAt} title={fullStamp(n.createdAt)} style={{ fontSize: 13, color: '#5f6b7d', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(n.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
