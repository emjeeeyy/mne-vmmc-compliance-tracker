'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { User, CalendarDays, PieChart, Clock, AlertTriangle, CheckCircle2, Bell, ArrowRight, TrendingUp, TrendingDown, BarChart3, AlertCircle, Flame, Send, Check, RefreshCw } from 'lucide-react'
import HeroBand from '@/components/HeroBand'
import { fadeRise } from '@/lib/motion'
import { api, ApiError } from '@/lib/api'

export interface DepartmentClearance { name: string; code: string; upToDate: number; dueSoon: number; overdue: number }
export interface FollowUpEntry {
  recordId: string
  employeeId: string
  fullName: string
  department: string
  module: string
  dueDate: string
  lastReminderAt: string | null
}
export interface AdminOverview {
  role: 'admin'
  hospitalCompliance: { rate: number; trendDelta: number }
  totalPersonnel: number
  criticalCases: number
  annualClearanceProgress: { rate: number; monthlyBreakdown: { label: string; value: number }[] }
  trackedPercent: number
  previousCycleRate: number | null
  clearanceCounts: { upToDate: number; dueSoon: number; overdue: number }
  departmentClearance: DepartmentClearance[]
  followUps: FollowUpEntry[]
  followUpTotal: number
}

// Status colors for the charts. Validated together (scripts/validate_palette.js, light surface): lightness band,
// chroma floor, protanopia/deuteranopia/tritanopia separation (worst 10.5), normal-vision separation 18.6, and
// 3:1+ contrast on white. Every chart also names the series in a legend and in tooltips/readouts, so color is
// never the only encoding.
const SERIES = [
  { key: 'upToDate', color: '#00703f', barLabel: 'Cleared / Up to Date', ringLabel: 'Cleared Staff' },
  { key: 'dueSoon', color: '#e36e15', barLabel: 'Due Soon (15 Days)', ringLabel: 'Due Soon' },
  { key: 'overdue', color: '#be123c', barLabel: 'Action Required / Overdue', ringLabel: 'Action Required' },
] as const

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000

function niceScale(max: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const step = steps.find(s => Math.ceil(Math.max(max, 1) / s) <= 7) ?? 1000
  const top = Math.max(1, Math.ceil(max / step)) * step
  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return { top, ticks }
}

const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const cardStyle = { background: '#fff', borderRadius: 18, boxShadow: '0 3px 6px rgba(15,23,42,0.14)', border: '1px solid #eef1f5' } as const

function CardHeader({ icon, title, subtitle, right }: { icon?: ReactNode; title: string; subtitle: string; right?: ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>{icon}{title}</h2>
          <div style={{ fontSize: 13, color: '#55667e', marginTop: 2 }}>{subtitle}</div>
        </div>
        {right}
      </div>
      <div style={{ height: 1, background: '#f0f2f5', marginTop: 14 }} />
    </div>
  )
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 22px', listStyle: 'none', margin: '18px 0 0', padding: 0 }}>
      {items.map(i => (
        <li key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
          <span aria-hidden="true" style={{ width: 18, height: 10, borderRadius: 2, background: i.color, flexShrink: 0 }} />{i.label}
        </li>
      ))}
    </ul>
  )
}

function StatTile({ label, value, valueColor, icon, iconBg, children }: { label: string; value: string; valueColor: string; icon: ReactNode; iconBg: string; children: ReactNode }) {
  return (
    <div style={{ ...cardStyle, borderRadius: 16, padding: '18px 22px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
          <div style={{ fontSize: 'clamp(30px, 2.5vw, 44px)', fontWeight: 700, lineHeight: 1.15, color: valueColor, marginTop: 4 }}>{value}</div>
        </div>
        <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 14, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 10 }}>{children}</div>
    </div>
  )
}

/** Stacked bars: one per department, segments are cleared / due soon / overdue. Hover or keyboard focus
 * shows the exact counts; the same numbers are in each bar's accessible label. */
function DepartmentBars({ data }: { data: DepartmentClearance[] }) {
  const [active, setActive] = useState<number | null>(null)
  const totals = data.map(d => d.upToDate + d.dueSoon + d.overdue)
  const { top, ticks } = niceScale(Math.max(0, ...totals))
  const PLOT_HEIGHT = 'clamp(240px, 19vw, 340px)'

  if (data.length === 0) return <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 13, color: '#5f6b7d' }}>No clearance records for this cycle yet.</div>

  const activeEntry = active !== null ? data[active] : null
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', marginTop: 18 }}>
        <div style={{ position: 'relative', height: PLOT_HEIGHT }} aria-hidden="true">
          {ticks.map(t => (
            <span key={t} style={{ position: 'absolute', right: 8, bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)', fontSize: 11, color: '#5f6b7d' }}>{t}</span>
          ))}
        </div>
        <div style={{ position: 'relative', height: PLOT_HEIGHT }}>
          {ticks.map(t => (
            <div key={t} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / top) * 100}%`, borderTop: `1px solid ${t === 0 ? '#c9d1db' : '#eef1f5'}` }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {data.map((d, i) => {
              const total = totals[i]
              const segs = SERIES.map(s => ({ s, v: d[s.key] })).filter(x => x.v > 0)
              return (
                <div key={d.code} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                  <motion.div
                    tabIndex={0}
                    role="img"
                    aria-label={`${d.name}: ${total} staff. ${SERIES.map(s => `${s.barLabel} ${d[s.key]}`).join(', ')}.`}
                    onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                    initial={{ height: 0 }} animate={{ height: `${(total / top) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827]"
                    style={{ width: '70%', maxWidth: 112, display: 'flex', flexDirection: 'column-reverse', borderRadius: '4px 4px 0 0', overflow: 'hidden', opacity: active === null || active === i ? 1 : 0.55, transition: 'opacity 0.15s' }}
                  >
                    {segs.map(({ s, v }, k) => (
                      <div key={s.key} style={{ height: `${(v / total) * 100}%`, background: s.color, boxShadow: k > 0 ? 'inset 0 2px 0 #fff' : 'none' }} />
                    ))}
                  </motion.div>
                </div>
              )
            })}
          </div>
          {activeEntry && active !== null && (
            <div role="status" style={{ position: 'absolute', zIndex: 5, pointerEvents: 'none', left: `${((active + 0.5) / data.length) * 100}%`, bottom: `calc(${(totals[active] / top) * 100}% + 10px)`, transform: `translateX(${active === 0 && data.length > 2 ? '-25%' : active === data.length - 1 && data.length > 2 ? '-75%' : '-50%'})`, background: '#111827', color: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 12, minWidth: 190, boxShadow: '0 6px 16px rgba(0,0,0,0.25)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{activeEntry.name} · {totals[active]} staff</div>
              {SERIES.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: s.color, boxShadow: '0 0 0 1.5px #fff', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{s.barLabel}</span><strong>{activeEntry[s.key]}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div />
        <div style={{ display: 'flex', marginTop: 8 }} aria-hidden="true">
          {data.map(d => (
            <div key={d.code} title={d.name} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>{d.name}</div>
          ))}
        </div>
      </div>
      <Legend items={SERIES.map(s => ({ color: s.color, label: s.barLabel }))} />
      <table className="sr-only">
        <caption>Clearance status by department</caption>
        <thead><tr><th scope="col">Department</th>{SERIES.map(s => <th key={s.key} scope="col">{s.barLabel}</th>)}</tr></thead>
        <tbody>{data.map(d => <tr key={d.code}><th scope="row">{d.name}</th>{SERIES.map(s => <td key={s.key}>{d[s.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function ComplianceDonut({ counts }: { counts: AdminOverview['clearanceCounts'] }) {
  const [active, setActive] = useState<number | null>(null)
  const total = counts.upToDate + counts.dueSoon + counts.overdue
  const R = 84
  const C = 2 * Math.PI * R
  const nonzero = SERIES.filter(s => counts[s.key] > 0).length
  const gap = nonzero > 1 ? 2.5 : 0
  let offset = 0
  const arcs = SERIES.map((s, i) => {
    const v = counts[s.key]
    const len = total > 0 ? (v / total) * C : 0
    const arc = { s, i, v, len, offset }
    offset += len
    return arc
  }).filter(a => a.v > 0)
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0)
  const act = active !== null ? SERIES[active] : null

  return (
    <div>
      <div style={{ position: 'relative', width: 'min(100%, 340px)', aspectRatio: '1', margin: '18px auto 0' }}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: 'block' }}>
          <circle cx="100" cy="100" r={R} fill="none" stroke="#eef1f5" strokeWidth="22" />
          {arcs.map(a => (
            <circle key={a.s.key} cx="100" cy="100" r={R} fill="none" stroke={a.s.color} strokeWidth={active === a.i ? 26 : 22}
              strokeDasharray={`${Math.max(a.len - gap, 0.5)} ${C}`} strokeDashoffset={-a.offset} transform="rotate(-90 100 100)"
              tabIndex={0} role="img" aria-label={`${a.s.ringLabel}: ${a.v} of ${total} (${pct(a.v)}%)`}
              onMouseEnter={() => setActive(a.i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(a.i)} onBlur={() => setActive(null)}
              className="outline-none" style={{ transition: 'stroke-width 0.15s', opacity: active === null || active === a.i ? 1 : 0.55 }}
            />
          ))}
        </svg>
        <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          {act && active !== null ? (
            <>
              <div style={{ fontSize: 'clamp(26px, 2.4vw, 38px)', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{pct(counts[act.key])}%</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{act.ringLabel}</div>
              <div style={{ fontSize: 12, color: '#5f6b7d' }}>{counts[act.key]} of {total}</div>
            </>
          ) : total === 0 ? (
            <div style={{ fontSize: 13, color: '#5f6b7d', maxWidth: 130 }}>No records for this cycle yet</div>
          ) : null}
        </div>
      </div>
      <Legend items={SERIES.map(s => ({ color: s.color, label: `${s.ringLabel} · ${counts[s.key]}` }))} />
    </div>
  )
}

type ReminderStatus = 'idle' | 'sending' | 'sent' | 'error'

function ReminderButton({ status, onSend, name }: { status: ReminderStatus; onSend: () => void; name: string }) {
  const done = status === 'sent'
  return (
    <button onClick={onSend} disabled={status === 'sending' || done} aria-label={done ? `Reminder sent to ${name}` : `Send reminder to ${name}`}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 34, padding: '0 14px', border: 'none', borderRadius: 7, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: done ? '#e0f3e6' : '#006042', color: done ? '#004b2b' : '#fff', cursor: status === 'sending' || done ? 'default' : 'pointer', opacity: status === 'sending' ? 0.75 : 1 }}
    >
      {done ? <Check size={14} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
      {status === 'sending' ? 'Sending…' : done ? 'Reminder Sent' : 'Send Reminder'}
    </button>
  )
}

function OverduePill() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 12px 0 9px', borderRadius: 999, background: '#ffe4e6', color: '#9f1239', fontSize: 12, fontWeight: 600 }}>
      <AlertTriangle size={13} aria-hidden="true" /> Overdue
    </span>
  )
}

const FOLLOW_UP_COLUMNS = [
  { label: 'Staff Member', width: '23%', align: 'left' },
  { label: 'Department', width: '13%', align: 'center' },
  { label: 'Screening Module', width: '16%', align: 'center' },
  { label: 'Schedule Mandate', width: '18%', align: 'center' },
  { label: 'Status', width: '14%', align: 'center' },
  { label: 'Action', width: '16%', align: 'center' },
] as const

function FollowUpCard({ data }: { data: AdminOverview }) {
  const router = useRouter()
  const [statuses, setStatuses] = useState<Record<string, ReminderStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const statusOf = (e: FollowUpEntry): ReminderStatus => statuses[e.recordId] ?? (e.lastReminderAt && Date.now() - Date.parse(e.lastReminderAt) < REMINDER_COOLDOWN_MS ? 'sent' : 'idle')

  const send = async (entry: FollowUpEntry) => {
    setStatuses(s => ({ ...s, [entry.recordId]: 'sending' }))
    setErrors(e => ({ ...e, [entry.recordId]: '' }))
    try {
      await api.post(`/monitoring/records/${entry.recordId}/remind`)
      setStatuses(s => ({ ...s, [entry.recordId]: 'sent' }))
    } catch (err) {
      // 409 = already reminded in the last 24h (e.g. from another admin's session): show it as sent.
      if (err instanceof ApiError && err.status === 409) { setStatuses(s => ({ ...s, [entry.recordId]: 'sent' })); return }
      setStatuses(s => ({ ...s, [entry.recordId]: 'error' }))
      setErrors(e => ({ ...e, [entry.recordId]: err instanceof ApiError && err.message ? err.message : 'Could not send. Please try again.' }))
    }
  }
  const { followUps, followUpTotal } = data

  return (
    <motion.div custom={6} variants={fadeRise} initial="hidden" animate="visible" style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ padding: '22px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
            <AlertCircle size={17} color="#be123c" aria-hidden="true" /> Personnel Requiring Immediate Follow-up
          </h2>
          <div style={{ fontSize: 13, color: '#55667e', marginTop: 2 }}>Healthcare staff with overdue annual physical exams</div>
        </div>
        {followUpTotal > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 14px 0 10px', borderRadius: 8, background: '#ffe4e6', color: '#9f1239', fontSize: 13, fontWeight: 600 }}>
            <Flame size={14} aria-hidden="true" /> High Priority
          </span>
        )}
      </div>

      {followUpTotal === 0 ? (
        <div style={{ padding: '36px 24px 44px', textAlign: 'center', borderTop: '1px solid #eef1f5' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>No overdue personnel</div>
          <div style={{ fontSize: 13, color: '#5f6b7d', marginTop: 4 }}>Everyone with a record this cycle is either cleared or still within their deadline.</div>
        </div>
      ) : (
        <>
          <div className="hidden xl:block" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <caption className="sr-only">Staff with overdue annual physical exams</caption>
              <colgroup>{FOLLOW_UP_COLUMNS.map(c => <col key={c.label} style={{ width: c.width }} />)}</colgroup>
              <thead>
                <tr style={{ background: '#f4f7fb', height: 50 }}>
                  {FOLLOW_UP_COLUMNS.map((c, i) => (
                    <th key={c.label} scope="col" style={{ textAlign: c.align, padding: i === 0 ? '0 12px 0 24px' : '0 12px', fontSize: 12, fontWeight: 600, color: '#1a2b41', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {followUps.map(e => (
                  <tr key={e.recordId} style={{ height: 66, borderTop: '1px solid #eef1f5' }}>
                    <td style={{ padding: '8px 12px 8px 24px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.fullName}>{e.fullName}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{e.employeeId}</div>
                    </td>
                    <td style={{ padding: '0 12px', textAlign: 'center', fontSize: 14, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.department}</td>
                    <td style={{ padding: '0 12px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', background: '#eef3f8', color: '#262c38', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 500 }}>{e.module}</span>
                    </td>
                    <td style={{ padding: '0 12px', textAlign: 'center', fontSize: 14, fontWeight: 500, color: '#be123c', whiteSpace: 'nowrap' }}>{longDate(e.dueDate)}</td>
                    <td style={{ padding: '0 12px', textAlign: 'center' }}><OverduePill /></td>
                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                      <ReminderButton status={statusOf(e)} onSend={() => send(e)} name={e.fullName} />
                      {errors[e.recordId] && <div role="alert" style={{ fontSize: 11, color: '#b42318', marginTop: 3 }}>{errors[e.recordId]}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xl:hidden" style={{ padding: '0 16px 16px' }}>
            {followUps.map(e => (
              <div key={e.recordId} style={{ border: '1px solid #eef1f5', borderRadius: 14, padding: 16, background: '#fafcfd' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{e.fullName}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{e.employeeId} · {e.department} · {e.module}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  <OverduePill />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#be123c' }}>Due {longDate(e.dueDate)}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <ReminderButton status={statusOf(e)} onSend={() => send(e)} name={e.fullName} />
                  {errors[e.recordId] && <div role="alert" style={{ fontSize: 11, color: '#b42318', marginTop: 3 }}>{errors[e.recordId]}</div>}
                </div>
              </div>
            ))}
          </div>

          {followUpTotal > followUps.length && (
            <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#5f6b7d' }}>
              <span>Showing the {followUps.length} most overdue of {followUpTotal}.</span>
              <button onClick={() => router.push('/compliance')} style={{ background: 'none', border: 'none', color: '#047857', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36 }}>See everyone in Modules Registry →</button>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

/** The admin "Health Overview": hero, four headline numbers, department and compliance-ratio charts, and the
 * overdue follow-up list with a working "Send Reminder". Features the mockup doesn't draw (critical cases,
 * month-by-month analytics, CSV report exports) stay reachable in "More Overview" at the bottom. */
export default function AdminLanding({ data: raw, onShowAnalytics, moreContent }: { data: AdminOverview; onShowAnalytics: () => void; moreContent: ReactNode }) {
  // The frontend and backend deploy separately, so for a short window a new frontend can meet an old backend
  // that doesn't send these fields yet. Default them so that window shows an empty page, not a crash.
  const data: AdminOverview = {
    ...raw,
    trackedPercent: raw.trackedPercent ?? 0,
    previousCycleRate: raw.previousCycleRate ?? null,
    clearanceCounts: raw.clearanceCounts ?? { upToDate: 0, dueSoon: 0, overdue: 0 },
    departmentClearance: raw.departmentClearance ?? [],
    followUps: raw.followUps ?? [],
    followUpTotal: raw.followUpTotal ?? 0,
  }
  const { clearanceCounts: counts } = data
  const rate = data.hospitalCompliance.rate
  const delta = data.previousCycleRate === null ? null : rate - data.previousCycleRate

  return (
    <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12" style={{ fontFamily: 'Poppins,sans-serif' }}>
      <HeroBand
        title={<>Protecting Those<br />Who <span style={{ color: '#80d4aa' }}>Care</span> for Others.</>}
        description="Welcome to the VMMC Staff Health Portal. Effortlessly monitor annual physical exams, track clearances, and manage screening reminders across all hospital units."
        chips={[{ icon: User, text: `${data.totalPersonnel} Staff Registered` }, { icon: CalendarDays, text: 'Birth-Month APE Cycle' }]}
      />

      <div className="px-6 lg:px-[2.7vw]" style={{ paddingTop: 'clamp(24px, 2.9vw, 60px)', paddingBottom: 24 }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible">
            <StatTile label="Total Staff Registered" value={String(data.totalPersonnel)} valueColor="#111827" iconBg="#cfdcd2" icon={<User size={24} color="#1f5d3a" fill="#1f5d3a" />}>
              <CheckCircle2 size={13} color="#2e7d32" aria-hidden="true" /><strong style={{ color: '#2e7d32' }}>{data.trackedPercent}%</strong><span style={{ color: '#5f6b7d' }}>Tracked this cycle</span>
            </StatTile>
          </motion.div>
          <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible">
            <StatTile label="Clearance Rate" value={`${rate}%`} valueColor="#2e7d32" iconBg="#e6f4ea" icon={<PieChart size={24} color="#1f5d3a" fill="#1f5d3a" />}>
              {delta === null ? (
                <span style={{ color: '#5f6b7d' }}>No previous cycle on file</span>
              ) : (
                <>
                  {delta >= 0 ? <TrendingUp size={13} color="#2e7d32" aria-hidden="true" /> : <TrendingDown size={13} color="#b42318" aria-hidden="true" />}
                  <strong style={{ color: delta >= 0 ? '#2e7d32' : '#b42318' }}>{delta >= 0 ? '+' : '−'} {Math.abs(delta)}%</strong><span style={{ color: '#5f6b7d' }}>vs Previous Cycle</span>
                </>
              )}
            </StatTile>
          </motion.div>
          <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible">
            <StatTile label="Upcoming Due (15 Days)" value={String(counts.dueSoon)} valueColor="#a16207" iconBg="#fdf0d5" icon={<Clock size={24} color="#c27803" />}>
              <Bell size={13} color="#92400e" aria-hidden="true" /><strong style={{ color: '#92400e', fontWeight: 600 }}>Reminders dispatch weekly</strong>
            </StatTile>
          </motion.div>
          <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible">
            <StatTile label="Action Required" value={String(counts.overdue)} valueColor="#be123c" iconBg="#ffe4e6" icon={<AlertTriangle size={24} color="#be123c" fill="#be123c" />}>
              <ArrowRight size={13} color="#be123c" aria-hidden="true" /><strong style={{ color: '#9f1239', fontWeight: 600 }}>Overdue Birth-Month Exams</strong>
            </StatTile>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6" style={{ marginTop: 24 }}>
          <motion.div custom={4} variants={fadeRise} initial="hidden" animate="visible" style={{ ...cardStyle, padding: '22px 24px 24px' }}>
            <CardHeader icon={<BarChart3 size={17} color="#00703f" aria-hidden="true" />} title="Department Health Clearance Status" subtitle="Distribution of cleared, upcoming due, and overdue personnel by unit"
              right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 8, background: '#e0f3e6', color: '#004b2b', fontSize: 12, fontWeight: 600, flexShrink: 0 }}><RefreshCw size={12} aria-hidden="true" /> Live</span>} />
            <DepartmentBars data={data.departmentClearance} />
          </motion.div>
          <motion.div custom={5} variants={fadeRise} initial="hidden" animate="visible" style={{ ...cardStyle, padding: '22px 24px 24px' }}>
            <CardHeader title="Screening Compliance Ratio" subtitle="Hospital-wide health compliance status" />
            <ComplianceDonut counts={counts} />
          </motion.div>
        </div>

        <div style={{ marginTop: 24 }}><FollowUpCard data={data} /></div>

        <motion.div custom={7} variants={fadeRise} initial="hidden" animate="visible" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 12px' }}>More Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ marginBottom: 24 }}>
            <div style={{ ...cardStyle, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 12, background: '#ffe4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AlertCircle size={22} color="#be123c" /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Critical Cases</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#be123c', lineHeight: 1.2 }}>{data.criticalCases}</div>
                <div style={{ fontSize: 12, color: '#5f6b7d' }}>Staff with a positive X-ray or GeneXpert result</div>
              </div>
            </div>
            <div style={{ ...cardStyle, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{data.annualClearanceProgress.rate}% <span style={{ fontSize: 12, fontWeight: 400, color: '#5f6b7d' }}>of FY {new Date().getFullYear()}</span></div>
              </div>
              <button onClick={onShowAnalytics} style={{ height: 40, padding: '0 18px', background: '#111625', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View Detailed Analytics ›</button>
            </div>
          </div>
          {moreContent}
        </motion.div>
      </div>
    </div>
  )
}
