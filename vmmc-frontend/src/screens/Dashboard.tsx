'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck, Clock, Users, AlertCircle, BarChart3, TrendingDown, TrendingUp, ChevronLeft, Siren, Download, Check, Upload, User, CalendarDays, ArrowRight } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getRole, getPreciseRole } from '@/lib/auth'
import { api } from '@/lib/api'
import { SkeletonBlock, SkeletonCard } from '@/components/Skeleton'
import HeroBand from '@/components/HeroBand'
import AdminLanding, { type AdminOverview } from './AdminLanding'
import { formatFullDate, toCsv } from '@/lib/format'

interface Escalation {
  id: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  createdAt: string
  event: { type: string; subtype: string; severity: number; message: string }
  employee: { id: string; employeeId: string; fullName: string }
}

interface MonthlyPoint { label: string; value: number }

interface ScreeningChecklistItem {
  key: 'APE' | 'HEPB_TITER' | 'IMMUNIZATION'
  label: string
  status: 'VERIFIED' | 'DUE' | 'MISSING'
  detail: string | null
}

interface ScreeningProgress {
  verifiedCount: number
  total: number
  percent: number
  items: ScreeningChecklistItem[]
}

interface StaffOverview {
  role: 'staff'
  employeeId: string
  totalPersonnel: number
  lastAuditedAt: string | null
  nextDue: { date: string; progressPercent: number; triggerLabel: string } | null
  department: { name: string; code: string; complianceRate: number; pendingStaffCount: number }
  urgentActiveActions: number
  registryCompliance: number
  reportsVerifiedToday: number
  pendingActions: string
  monthlyTrend: MonthlyPoint[]
  screeningProgress: ScreeningProgress
}

type Overview = StaffOverview | AdminOverview

function DashboardSkeleton() {
  return (
    <>
      {/* Mobile skeleton */}
      <div className="sm:hidden">
        <SkeletonBlock width="55%" height={22} style={{ marginBottom: 20 }} />
        <div style={{ borderRadius: 20, padding: 20, background: '#f1f5f9', marginBottom: 16 }}>
          <SkeletonBlock width="40%" height={11} style={{ marginBottom: 12, background: '#e2e8f0' }} />
          <SkeletonBlock width="35%" height={26} style={{ marginBottom: 14, background: '#e2e8f0' }} />
          <SkeletonBlock height={6} radius={999} style={{ background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} height={40} />)}
        </div>
      </div>

      {/* Desktop skeleton */}
      <div className="hidden sm:block" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SkeletonBlock width={260} height={26} style={{ marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} height={36} />)}
        </div>
        <SkeletonCard height={220} style={{ marginBottom: 24 }} />
      </div>
    </>
  )
}

function EscalationsCard({ escalations, onAcknowledge, acknowledging }: { escalations: Escalation[]; onAcknowledge: (id: string) => void; acknowledging: string | null }) {
  const open = escalations.filter(e => e.status !== 'RESOLVED')
  if (open.length === 0) return null

  return (
    <motion.div custom={2.5} variants={fadeRise} initial="hidden" animate="visible"
      style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: 24 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Siren size={18} color="#c53030" />
        </div>
        <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151' }}>Escalations Requiring Attention</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {open.map(esc => (
          <div key={esc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fff', border: '1px solid #feb2b2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, color: '#c53030' }}>
              {esc.employee.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f3151' }}>{esc.employee.fullName}</div>
              <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2, lineHeight: 1.4 }}>{esc.event.message}</div>
            </div>
            {esc.status === 'ACKNOWLEDGED' ? (
              <span style={{ background: '#fffbea', color: '#b7791f', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>Acknowledged</span>
            ) : (
              <motion.button
                onClick={() => onAcknowledge(esc.id)}
                disabled={acknowledging === esc.id}
                whileHover={{ filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.97 }}
                style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, cursor: acknowledging === esc.id ? 'default' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap', opacity: acknowledging === esc.id ? 0.6 : 1 }}
              >
                {acknowledging === esc.id ? 'Acknowledging…' : 'Acknowledge'}
              </motion.button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

const REPORTS = [
  { key: 'delinquency', label: 'Departmental Delinquency Log', path: '/reports/delinquency' },
  { key: 'clearance-summary', label: 'Institutional Clearance Summary', path: '/reports/clearance-summary' },
  { key: 'biological-matrix', label: 'Biological Exposure & Prophylaxis Matrix', path: '/reports/biological-matrix' },
] as const

function ReportsExportCard() {
  const [exporting, setExporting] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)

  const handleExport = async (path: string, key: string, label: string) => {
    setExporting(key)
    try {
      const rows = await api.get<Record<string, unknown>[]>(path)
      const csv = toCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${label.replace(/\s+/g, '_')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setExported(key)
      setTimeout(() => setExported(null), 2200)
    } catch {
      // best-effort — the button simply reverts to its normal state on failure
    } finally {
      setExporting(null)
    }
  }

  return (
    <motion.div custom={5} variants={fadeRise} initial="hidden" animate="visible"
      style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: 24 }}
    >
      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', marginBottom: 16 }}>Reports</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {REPORTS.map(report => (
          <div key={report.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ebf8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={18} color="#4299e1" />
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#1f3151' }}>{report.label}</div>
            <motion.button
              onClick={() => handleExport(report.path, report.key, report.label)}
              disabled={exporting === report.key}
              whileHover={{ filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.97 }}
              style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', minHeight: 44, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, cursor: exporting === report.key ? 'default' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap', opacity: exporting === report.key ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <AnimatePresence mode="wait">
                {exported === report.key ? (
                  <motion.span key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} /> Exported
                  </motion.span>
                ) : (
                  <motion.span key="idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={13} /> {exporting === report.key ? 'Exporting…' : 'Export CSV'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/** Thin open arc, no track — the arc's gap is centered on 9 o'clock at 75%, matching the mockup. */
function AnimatedRing({ percent, centerValue, caption, size = 163, fluid = false }: { percent: number; centerValue: string; caption: string; size?: number; fluid?: boolean }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)
  const [showLabel, setShowLabel] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setOffset(circ * (1 - percent / 100)), 300)
    const t2 = setTimeout(() => setShowLabel(true), 1100)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [circ, percent])
  return (
    // fluid: the mockup's 163px ring at 1440 (11.3vw) scales with the card instead of staying fixed.
    <div style={{ position: 'relative', width: fluid ? 'clamp(140px, 11.3vw, 240px)' : size, aspectRatio: '1', margin: '0 auto', flexShrink: 0 }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#008d46" strokeWidth={stroke}
          strokeDasharray={`${circ}`} strokeDashoffset={offset}
          transform={`rotate(-135 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', opacity: showLabel ? 1 : 0, transition: 'opacity 0.4s' }}>
        <div style={{ fontSize: fluid ? 'clamp(26px, 2.22vw, 48px)' : 32, fontWeight: 700, color: '#2e3137', lineHeight: 1.06 }}>{centerValue}</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#64748b', letterSpacing: '0.02em', lineHeight: '14px' }}>{caption}</div>
      </div>
    </div>
  )
}

function StatusDot({ verified }: { verified: boolean }) {
  return verified ? (
    <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#4b7b3c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Check size={10} color="#fff" strokeWidth={3.5} />
    </span>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="#e1a13c" />
      <path d="M8 4.2V8.3L10.6 9.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function ScreeningChecklistRow({ item }: { item: ScreeningChecklistItem }) {
  const verified = item.status === 'VERIFIED'
  const ink = verified ? '#101010' : '#7b381b'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 32, padding: '0 14px 0 16px', borderRadius: 8, border: `1px solid ${verified ? '#e8edf3' : '#f6e2a3'}`, background: verified ? '#f7f9fc' : '#fffbe8', fontFamily: 'Poppins,sans-serif' }}>
      <StatusDot verified={verified} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: verified ? '#006042' : ink, flexShrink: 0 }}>
        {verified ? 'Verified' : item.detail}
      </div>
    </div>
  )
}


function TrendBars({ data }: { data: MonthlyPoint[] }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: '100%', background: '#4299e1', borderRadius: 6, minHeight: 4 }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#5f6b7d' }}>{d.label}</div>
        ))}
      </div>
    </div>
  )
}

function daysRemaining(dateStr: string): number {
  const due = new Date(dateStr)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

function monthName(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
}

/** A raw day-count against `nextDue.date` goes negative once the deadline passes — meaningless
 * once the employee has actually cleared this cycle (the date itself doesn't move forward until
 * next year's record exists), and needs "Overdue" framing rather than a bare negative number
 * when they haven't cleared it. `apeVerified` comes from screeningProgress, not nextDue itself,
 * since nextDue's own progressPercent/date can't distinguish "cleared" from "deadline passed". */
function screeningCycleStatusText(dateStr: string, apeVerified: boolean): string {
  if (apeVerified) return `Cleared for this cycle (Birth-Month ${monthName(dateStr)} Schedule)`
  const days = daysRemaining(dateStr)
  if (days < 0) return `Overdue by ${Math.abs(days)} Day${Math.abs(days) === 1 ? '' : 's'} (Birth-Month ${monthName(dateStr)} Schedule)`
  return `Next Screening Due: ${days} Day${days === 1 ? '' : 's'} Remaining (Birth-Month ${monthName(dateStr)} Schedule)`
}

function monthlyStats(data: MonthlyPoint[]) {
  if (data.length === 0) {
    return { highest: { label: '—', value: 0 }, lowest: { label: '—', value: 0 }, average: 0 }
  }
  const highest = data.reduce((a, b) => (b.value > a.value ? b : a))
  const lowest = data.reduce((a, b) => (b.value < a.value ? b : a))
  const average = Math.round(data.reduce((sum, d) => sum + d.value, 0) / data.length)
  return { highest, lowest, average }
}

export default function Dashboard() {
  const router = useRouter()
  const [role, setRole] = useState<'staff' | 'admin'>('staff')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [isUnitHead, setIsUnitHead] = useState(false)
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [acknowledging, setAcknowledging] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)

  useEffect(() => {
    setRole(getRole())
    setIsUnitHead(getPreciseRole() === 'UNIT_HEAD')
  }, [])

  useEffect(() => {
    api.get<Overview>('/dashboard/overview').then(setOverview).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isUnitHead) return
    api.get<Escalation[]>('/escalations').then(setEscalations).catch(() => {})
  }, [isUnitHead])

  const handleAcknowledge = async (id: string) => {
    setAcknowledging(id)
    try {
      await api.patch(`/escalations/${id}/acknowledge`)
      setEscalations(prev => prev.map(e => (e.id === id ? { ...e, status: 'ACKNOWLEDGED' } : e)))
    } catch {
      // best-effort — leave the row as-is so the user can retry
    } finally {
      setAcknowledging(null)
    }
  }

  if (!overview) {
    return <DashboardSkeleton />
  }
  const adminData = overview.role === 'admin' ? overview : null
  const staffData = overview.role === 'staff' ? overview : null
  const adminMonthly = adminData?.annualClearanceProgress.monthlyBreakdown ?? []
  const adminStats = monthlyStats(adminMonthly)

  return (
    <>
      {/* Mobile-native dashboard (phones, < sm) */}
      <div className="sm:hidden">
        {role === 'admin' ? (
          showAnalytics ? (
            <div>
              <motion.button
                custom={0}
                variants={fadeRise}
                initial="hidden"
                animate="visible"
                onClick={() => setShowAnalytics(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: 0, minHeight: 44, marginBottom: 20 }}
              >
                <ChevronLeft size={16} /> Back to Dashboard
              </motion.button>

              <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 16 }}>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Detailed Analytics</h1>
                <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Annual Clearance Progress · FY 2026</div>
              </motion.div>

              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</span>
                  <BarChart3 size={18} color="#4299e1" style={{ flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20 }}>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                  <span style={{ fontSize: 12, color: '#5f6b7d' }}>of FY {new Date().getFullYear()}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                  {adminMonthly.map((d, i) => (
                    <div key={d.label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>{d.value}%</span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(d.value / Math.max(1, adminStats.highest.value)) * 100}%` }}
                        transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        style={{ width: '100%', background: '#4299e1', borderRadius: 6, minHeight: 4 }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {adminMonthly.map(d => (
                    <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#5f6b7d' }}>{d.label}</div>
                  ))}
                </div>
              </motion.div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Highest', month: adminStats.highest.label, value: `${adminStats.highest.value}%`, color: '#008d46' },
                  { label: 'Average', month: null, value: `${adminStats.average}%`, color: '#2b6cb0' },
                  { label: 'Lowest', month: adminStats.lowest.label, value: `${adminStats.lowest.value}%`, color: '#e53e3e' },
                ].map((s, i) => (
                  <motion.div key={s.label} custom={3 + i} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: '14px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                    {s.month && <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, marginTop: 2 }}>{s.month}</div>}
                  </motion.div>
                ))}
              </div>

              <motion.div custom={6} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 16 }}>Monthly Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {adminMonthly.map((d, i) => {
                    const prev = i > 0 ? adminMonthly[i - 1].value : null
                    const delta = prev !== null ? d.value - prev : null
                    return (
                      <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1f3151' }}>{d.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {delta !== null && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: delta >= 0 ? '#38a169' : '#e53e3e' }}>
                              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                            </span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1f3151', minWidth: 32, textAlign: 'right' }}>{d.value}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </div>
          ) : (
          <>
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Hospital Metrics</h1>
              <span style={{ background: '#ebf8ff', color: '#2b6cb0', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>Live Sync</span>
            </motion.div>

            <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)', borderRadius: 20, padding: 20, color: '#fff', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#cbd5e0' }}>Hospital Compliance</span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800 }}>{adminData?.hospitalCompliance.rate ?? 0}%</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: (adminData?.hospitalCompliance.trendDelta ?? 0) < 0 ? '#fc8181' : '#68d391' }}>
                  {(adminData?.hospitalCompliance.trendDelta ?? 0) < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />} {Math.abs(adminData?.hospitalCompliance.trendDelta ?? 0)}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${adminData?.hospitalCompliance.rate ?? 0}%`, height: '100%', background: 'linear-gradient(to right, #4ade80, #00b06b)', borderRadius: 999 }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e0' }}>Goal: 95% Occupational Safety Standard</div>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Users size={18} color="#4299e1" />
                <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Total Personnel</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#2b6cb0', marginTop: 4 }}>{adminData?.totalPersonnel ?? 0}</div>
              </motion.div>
              <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <AlertCircle size={18} color="#e53e3e" />
                <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Critical Cases</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#e53e3e', marginTop: 4 }}>{adminData?.criticalCases ?? 0}</div>
              </motion.div>
            </div>

            <ReportsExportCard />

            <motion.div custom={4} variants={fadeRise} initial="hidden" animate="visible" style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
              Hospital Trends
            </motion.div>

            <motion.div custom={5} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</span>
                <BarChart3 size={18} color="#4299e1" style={{ flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                <span style={{ fontSize: 12, color: '#5f6b7d' }}>of FY {new Date().getFullYear()}</span>
              </div>
              <TrendBars data={adminMonthly} />
              <button
                onClick={() => setShowAnalytics(true)}
                style={{ width: '100%', marginTop: 20, padding: '14px 0', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827', color: '#fff', border: 'none', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                View Detailed Analytics
              </button>
            </motion.div>
          </>
          )
        ) : (
          <>
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible"
              style={{ borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(135deg, #0c4f38 0%, #1f3151 100%)', padding: 20, color: '#fff', marginBottom: 16 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 700, marginBottom: 14 }}>
                <ShieldCheck size={12} color="#4ade80" /> #1 hospital for our heroes
              </span>
              <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, lineHeight: 1.25, margin: 0, marginBottom: 14 }}>
                My <span style={{ color: '#4ade80' }}>Health Clearance</span>{' '}&amp; Screening Center
              </h1>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 700 }}>
                  <Users size={12} /> {staffData?.totalPersonnel ?? 0} Staff
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 700 }}>
                  <Clock size={12} /> Birth-Month APE Cycle
                </span>
              </div>
            </motion.div>

            <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)', borderRadius: 20, padding: 20, color: '#fff', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ background: '#111827', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Surveillance Cycle: {new Date().getFullYear()}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#008541', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800 }}>
                  <CheckCircle2 size={12} /> Account Active
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#cbd5e0', marginBottom: 6 }}>Annual Physical Exam Deadline</div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, marginBottom: 14 }}>{staffData?.nextDue ? formatFullDate(staffData.nextDue.date) : '—'}</div>
              {(() => {
                const apeVerified = staffData?.screeningProgress.items.find(i => i.key === 'APE')?.status === 'VERIFIED'
                const overdue = staffData?.nextDue && !apeVerified && daysRemaining(staffData.nextDue.date) < 0
                const dotColor = overdue ? '#fc8181' : '#68d391'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, fontWeight: 700, color: dotColor }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                    {staffData?.nextDue ? screeningCycleStatusText(staffData.nextDue.date, apeVerified ?? false) : 'No active surveillance cycle'}
                  </div>
                )
              })()}
              <button onClick={() => router.push('/upload')}
                style={{ width: '100%', minHeight: 44, background: '#008541', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Submit File
              </button>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <ShieldCheck size={18} color="#4299e1" />
                <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Unit Compliance</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#2b6cb0', marginTop: 4 }}>{staffData?.department.complianceRate ?? 0}%</div>
              </motion.div>
              <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Clock size={18} color="#e53e3e" />
                <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Pending X-Rays</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#e53e3e', marginTop: 4 }}>{String(staffData?.department.pendingStaffCount ?? 0).padStart(2, '0')}</div>
              </motion.div>
            </div>

            <motion.div custom={4} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151' }}>My Screening Progress</div>
                <span style={{ border: '1px solid #00b06b', background: '#e6f9ee', color: '#047857', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                  {staffData?.screeningProgress.percent ?? 0}% Complete
                </span>
              </div>
              <AnimatedRing
                size={140}
                percent={staffData?.screeningProgress.percent ?? 0}
                centerValue={`${staffData?.screeningProgress.verifiedCount ?? 0}/${staffData?.screeningProgress.total ?? 3}`}
                caption="REQUIREMENTS"
              />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(staffData?.screeningProgress.items ?? []).map(item => <ScreeningChecklistRow key={item.key} item={item} />)}
              </div>
              <button onClick={() => router.push('/upload')}
                style={{ width: '100%', minHeight: 44, marginTop: 12, background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Upload size={14} /> Submit Missing Document
              </button>
            </motion.div>

            {isUnitHead && (
              <div style={{ marginTop: 16 }}>
                <EscalationsCard escalations={escalations} onAcknowledge={handleAcknowledge} acknowledging={acknowledging} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Tablet / desktop dashboard */}
      <div className="hidden sm:block" style={{ maxWidth: role === 'admin' && showAnalytics ? 1100 : undefined, margin: '0 auto' }}>
        {role === 'admin' ? (
          showAnalytics ? (
            <div style={{ maxWidth: 700 }}>
              <motion.button
                custom={0}
                variants={fadeRise}
                initial="hidden"
                animate="visible"
                onClick={() => setShowAnalytics(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: 0, minHeight: 44, marginBottom: 24 }}
              >
                <ChevronLeft size={16} /> Back to Dashboard
              </motion.button>

              <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Detailed Analytics</h1>
                <p style={{ fontSize: 13, color: '#5f6b7d', margin: 0 }}>Annual Clearance Progress · FY 2026</p>
              </motion.div>

              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</span>
                  <BarChart3 size={20} color="#4299e1" style={{ flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 24 }}>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 32, fontWeight: 800, color: '#1f3151' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                  <span style={{ fontSize: 12, color: '#5f6b7d' }}>of FY {new Date().getFullYear()}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
                  {adminMonthly.map((d, i) => (
                    <div key={d.label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', marginBottom: 8 }}>{d.value}%</span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(d.value / Math.max(1, adminStats.highest.value)) * 100}%` }}
                        transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        style={{ width: '100%', background: '#4299e1', borderRadius: 8, minHeight: 4 }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  {adminMonthly.map(d => (
                    <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#5f6b7d' }}>{d.label}</div>
                  ))}
                </div>
              </motion.div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Highest', month: adminStats.highest.label, value: `${adminStats.highest.value}%`, color: '#008d46' },
                  { label: 'Average', month: null, value: `${adminStats.average}%`, color: '#2b6cb0' },
                  { label: 'Lowest', month: adminStats.lowest.label, value: `${adminStats.lowest.value}%`, color: '#e53e3e' },
                ].map((s, i) => (
                  <motion.div key={s.label} custom={3 + i} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                    {s.month && <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, marginTop: 4 }}>{s.month}</div>}
                  </motion.div>
                ))}
              </div>

              <motion.div custom={6} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 20 }}>Monthly Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {adminMonthly.map((d, i) => {
                    const prev = i > 0 ? adminMonthly[i - 1].value : null
                    const delta = prev !== null ? d.value - prev : null
                    return (
                      <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1f3151' }}>{d.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {delta !== null && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: delta >= 0 ? '#38a169' : '#e53e3e' }}>
                              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                            </span>
                          )}
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#1f3151', minWidth: 36, textAlign: 'right' }}>{d.value}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </div>
          ) : adminData ? (
            <AdminLanding data={adminData} onShowAnalytics={() => setShowAnalytics(true)} moreContent={<ReportsExportCard />} />
          ) : null
        ) : (
        // Breaks out of <main>'s padding so the hero can continue the header's gradient edge to
        // edge — in the mockup the header and hero are one unbroken band, not a card on a page.
        <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12" style={{ fontFamily: 'Poppins,sans-serif' }}>
          <HeroBand
            title={<>My <span style={{ color: '#80d4aa' }}>Health Clearance</span><br />&amp; Screening Center</>}
            description="View your personal annual physical exam status, submit diagnostic files (Chest X-Rays, vaccine cards), and check pending clearance approvals."
            chips={[{ icon: User, text: `${staffData?.totalPersonnel ?? 0} Staff Registered` }, { icon: CalendarDays, text: 'Birth-Month APE Cycle' }]}
          />

          <div className="px-6 lg:px-[2.7vw]" style={{ paddingTop: 'clamp(24px, 2.9vw, 60px)' }}>
            {/* 3:2 on small laptops so the progress card's checklist labels don't truncate; the mockup's 2:1 from xl up. */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 xl:gap-[2.7vw]">
              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible"
                style={{ borderRadius: 18, padding: 'clamp(22px, 2vw, 32px) clamp(20px, 2.8vw, 40px)', color: '#fff', display: 'flex', flexDirection: 'column', background: 'radial-gradient(farthest-side at 100% 0%, #0c6246 0%, #134747 50%, #1b2a47 92%) #1b2a47' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 16px', borderRadius: 999, background: '#121c2e', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Surveillance Cycle: {new Date().getFullYear()}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 14px', borderRadius: 999, background: '#0e4337', border: '1px solid #00e2ae', color: '#00e2ae', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#00e2ae', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={9} color="#0e4337" strokeWidth={4} />
                    </span>
                    Account Active
                  </span>
                </div>
                <div style={{ marginTop: 'clamp(24px, 3vw, 44px)', fontSize: 12, fontWeight: 500, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#8aa1b3' }}>Annual Physical Exam Deadline</div>
                <div style={{ fontSize: 'clamp(28px, 2.5vw, 56px)', fontWeight: 700, lineHeight: 1.17, letterSpacing: '-0.01em', marginTop: 2 }}>{staffData?.nextDue ? formatFullDate(staffData.nextDue.date) : '—'}</div>
                {(() => {
                  const apeVerified = staffData?.screeningProgress.items.find(i => i.key === 'APE')?.status === 'VERIFIED'
                  const overdue = staffData?.nextDue && !apeVerified && daysRemaining(staffData.nextDue.date) < 0
                  const dotColor = overdue ? '#fc8181' : '#64d09e'
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, fontWeight: 700, color: dotColor }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      {staffData?.nextDue ? screeningCycleStatusText(staffData.nextDue.date, apeVerified ?? false) : 'No active surveillance cycle'}
                    </div>
                  )
                })()}
                <div style={{ marginTop: 24, background: '#16233c', borderRadius: 10, padding: '14px 20px 14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#1b2a48', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={20} color="#e1a13c" strokeWidth={2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff7f6' }}>Pending Health Requirement</div>
                    <div style={{ fontSize: 12, color: '#7f99ac', marginTop: 1 }}>{staffData?.pendingActions ?? '—'}</div>
                  </div>
                  <motion.button onClick={() => router.push('/upload')}
                    whileHover={{ filter: 'brightness(1.1)' }} whileTap={{ scale: 0.97 }}
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#007a53', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontFamily: 'Poppins,sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Submit File <ArrowRight size={12} strokeWidth={2.5} />
                  </motion.button>
                </div>
                <div style={{ flex: 1, minHeight: 32 }} />
                <div style={{ borderTop: '1px solid #29364d', paddingTop: 18, display: 'grid', gridTemplateColumns: '28% 31% 1fr' }}>
                  {[
                    { label: 'Department:', value: staffData?.department.name ?? '—' },
                    { label: 'Staff ID', value: staffData?.employeeId ?? '—' },
                    { label: 'Last Audited', value: staffData?.lastAuditedAt ? formatFullDate(staffData.lastAuditedAt) : '—' },
                  ].map(item => (
                    <div key={item.label} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#8aa1b3' }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible"
                style={{ background: '#fff', borderRadius: 20, border: '1px solid #edf0f3', padding: '22px 22px 30px', boxShadow: '0 1px 3px rgba(16,24,40,0.05)', display: 'flex', flexDirection: 'column' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>My Screening Progress</div>
                  <span style={{ border: '1px solid #a8ead0', background: '#e4fcf3', color: '#047857', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {staffData?.screeningProgress.percent ?? 0}% Complete
                  </span>
                </div>
                <div style={{ height: 1, background: '#f0f2f5', marginTop: 14, marginBottom: 26 }} />
                <AnimatedRing
                  fluid
                  percent={staffData?.screeningProgress.percent ?? 0}
                  centerValue={`${staffData?.screeningProgress.verifiedCount ?? 0}/${staffData?.screeningProgress.total ?? 3}`}
                  caption="REQUIREMENTS"
                />
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(staffData?.screeningProgress.items ?? []).map(item => <ScreeningChecklistRow key={item.key} item={item} />)}
                </div>
                <motion.button onClick={() => router.push('/upload')}
                  whileHover={{ filter: 'brightness(1.25)' }} whileTap={{ scale: 0.98 }}
                  style={{ marginTop: 14, width: '100%', height: 34, background: '#111625', color: '#fff', border: 'none', borderRadius: 7, fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                >
                  <Upload size={16} color="#80d4aa" /> Submit Missing Document
                </motion.button>
              </motion.div>
            </div>

            {isUnitHead && (
              <div style={{ marginTop: 40 }}>
                <EscalationsCard escalations={escalations} onAcknowledge={handleAcknowledge} acknowledging={acknowledging} />
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </>
  )
}
