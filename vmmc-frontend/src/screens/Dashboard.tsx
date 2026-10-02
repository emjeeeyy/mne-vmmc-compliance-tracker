'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, ShieldCheck, Clock, Users, AlertCircle, BarChart3, TrendingDown, TrendingUp, ChevronLeft, Siren, Download, Check } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getRole, getPreciseRole } from '@/lib/auth'
import { api } from '@/lib/api'
import { SkeletonBlock, SkeletonCard } from '@/components/Skeleton'
import { formatFullDate, toCsv } from '@/lib/format'

interface Escalation {
  id: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  createdAt: string
  event: { type: string; subtype: string; severity: number; message: string }
  employee: { id: string; employeeId: string; fullName: string }
}

interface MonthlyPoint { label: string; value: number }

interface StaffOverview {
  role: 'staff'
  nextDue: { date: string; progressPercent: number; triggerLabel: string } | null
  department: { name: string; code: string; complianceRate: number; pendingStaffCount: number }
  urgentActiveActions: number
  registryCompliance: number
  reportsVerifiedToday: number
  pendingActions: string
  monthlyTrend: MonthlyPoint[]
}

interface AdminOverview {
  role: 'admin'
  hospitalCompliance: { rate: number; trendDelta: number }
  totalPersonnel: number
  criticalCases: number
  annualClearanceProgress: { rate: number; monthlyBreakdown: MonthlyPoint[] }
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
              <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2, lineHeight: 1.4 }}>{esc.event.message}</div>
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

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      setVal(Math.round(p * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return val
}

function AnimatedRing({ percent, pendingCount }: { percent: number; pendingCount: number }) {
  const r = 50
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)
  const [showLabel, setShowLabel] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setOffset(circ * (1 - percent / 100)), 300)
    const t2 = setTimeout(() => setShowLabel(true), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [circ, percent])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <svg width="150" height="150" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1f3151" strokeWidth="14"
          strokeDasharray={`${circ}`} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }} />
        <text x="60" y="54" textAnchor="middle" fill="#1f3151" fontSize="32" fontWeight="800" fontFamily="Poppins,sans-serif"
          style={{ opacity: showLabel ? 1 : 0, transition: 'opacity 0.4s' }}>{String(pendingCount).padStart(2, '0')}</text>
        <text x="60" y="72" textAnchor="middle" fill="#718096" fontSize="10" fontWeight="700" fontFamily="Public Sans,sans-serif"
          style={{ opacity: showLabel ? 1 : 0, transition: 'opacity 0.4s 0.1s' }}>PENDING STAFF</text>
      </svg>
    </div>
  )
}

interface StatCardDef { icon: typeof AlertTriangle; color: string; bg: string; label: string; value: number | null; suffix: string }

function StatCard({ icon: Icon, color, bg, label, value, suffix, index }: StatCardDef & { index: number }) {
  const count = useCountUp(value ?? 0, 850)
  return (
    <motion.div custom={index} variants={fadeRise} initial="hidden" animate="visible"
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
      style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Icon size={22} color={color} strokeWidth={2.5} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#718096', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151' }}>
        {value !== null ? `${count} ${suffix.trim()}` : suffix}
      </div>
    </motion.div>
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
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#a0aec0' }}>{d.label}</div>
        ))}
      </div>
    </div>
  )
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
  const staffStatCards: StatCardDef[] = [
    { icon: AlertTriangle, color: '#f56565', bg: '#fff5f5', label: 'URGENT ACTIVE ACTIONS', value: staffData?.urgentActiveActions ?? 0, suffix: ' Cases' },
    { icon: CheckCircle2, color: '#48bb78', bg: '#f0fff4', label: 'REGISTRY COMPLIANCE', value: staffData?.registryCompliance ?? 0, suffix: ' Completed' },
    { icon: FileText, color: '#4299e1', bg: '#ebf8ff', label: 'REPORTS VERIFIED TODAY', value: staffData?.reportsVerifiedToday ?? 0, suffix: ' Files' },
    { icon: RefreshCw, color: '#9f7aea', bg: '#faf5ff', label: 'REGISTRY CYCLE REFRESH', value: null, suffix: 'Annual' },
  ]

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
                <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Annual Clearance Progress · FY 2026</div>
              </motion.div>

              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</span>
                  <BarChart3 size={18} color="#4299e1" style={{ flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20 }}>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                  <span style={{ fontSize: 12, color: '#a0aec0' }}>of FY {new Date().getFullYear()}</span>
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
                    <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#a0aec0' }}>{d.label}</div>
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
                    <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                    {s.month && <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, marginTop: 2 }}>{s.month}</div>}
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
              <span style={{ background: '#ebf8ff', color: '#3182ce', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>Live Sync</span>
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
                <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Total Personnel</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#2b6cb0', marginTop: 4 }}>{adminData?.totalPersonnel ?? 0}</div>
              </motion.div>
              <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <AlertCircle size={18} color="#e53e3e" />
                <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Critical Cases</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#e53e3e', marginTop: 4 }}>{adminData?.criticalCases ?? 0}</div>
              </motion.div>
            </div>

            <ReportsExportCard />

            <motion.div custom={4} variants={fadeRise} initial="hidden" animate="visible" style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
              Hospital Trends
            </motion.div>

            <motion.div custom={5} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</span>
                <BarChart3 size={18} color="#4299e1" style={{ flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                <span style={{ fontSize: 12, color: '#a0aec0' }}>of FY {new Date().getFullYear()}</span>
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
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Health Status</h1>
                <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Compliance Overview</div>
              </div>
              <span style={{ background: '#e6f9ee', color: '#008d46', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>Annual Cycle: {new Date().getFullYear()}</span>
            </motion.div>

            <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)', borderRadius: 20, padding: 20, color: '#fff', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#cbd5e0' }}>Your Next X-Ray Due</span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              </div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, marginBottom: 14 }}>{staffData?.nextDue ? formatFullDate(staffData.nextDue.date) : '—'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${staffData?.nextDue?.progressPercent ?? 0}%`, height: '100%', background: 'linear-gradient(to right, #4ade80, #00b06b)', borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{staffData?.nextDue?.progressPercent ?? 0}%</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.14)', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase' }}>
                <Clock size={12} /> {staffData?.nextDue?.triggerLabel ?? 'NO ACTIVE CYCLE'}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e0' }}>Annual Chest X-Ray Requirement</div>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <ShieldCheck size={18} color="#4299e1" />
                <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Unit Compliance</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#2b6cb0', marginTop: 4 }}>{staffData?.department.complianceRate ?? 0}%</div>
              </motion.div>
              <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Clock size={18} color="#e53e3e" />
                <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 8 }}>Pending X-Rays</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#e53e3e', marginTop: 4 }}>{String(staffData?.department.pendingStaffCount ?? 0).padStart(2, '0')}</div>
              </motion.div>
            </div>

            {isUnitHead && (
              <div style={{ marginTop: 16 }}>
                <EscalationsCard escalations={escalations} onAcknowledge={handleAcknowledge} acknowledging={acknowledging} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Tablet / desktop dashboard */}
      <div className="hidden sm:block" style={{ maxWidth: 1100, margin: '0 auto' }}>
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
                <p style={{ fontSize: 13, color: '#718096', margin: 0 }}>Annual Clearance Progress · FY 2026</p>
              </motion.div>

              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Annual Clearance Progress</span>
                  <BarChart3 size={20} color="#4299e1" style={{ flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 24 }}>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 32, fontWeight: 800, color: '#1f3151' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                  <span style={{ fontSize: 12, color: '#a0aec0' }}>of FY {new Date().getFullYear()}</span>
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
                    <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#a0aec0' }}>{d.label}</div>
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
                    <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                    {s.month && <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, marginTop: 4 }}>{s.month}</div>}
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
          ) : (
            <>
              <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>Hospital Compliance Overview</h1>
                  <p style={{ fontSize: 14, color: '#718096', marginBottom: 32 }}>Real-time hospital-wide surveillance analytics and personnel compliance tracking.</p>
                </div>
                <span style={{ background: '#ebf8ff', color: '#3182ce', borderRadius: 999, padding: '8px 16px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>Live Sync</span>
              </motion.div>

              <div className="flex flex-col lg:flex-row gap-6" style={{ marginBottom: 24 }}>
                <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible"
                  className="w-full lg:flex-[0_0_64%]"
                  style={{ borderRadius: 20, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)', padding: '32px 36px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <span style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>HOSPITAL COMPLIANCE</span>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 24 }}>
                    <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>{adminData?.hospitalCompliance.rate ?? 0}%</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: (adminData?.hospitalCompliance.trendDelta ?? 0) < 0 ? '#fc8181' : '#68d391' }}>
                      {(adminData?.hospitalCompliance.trendDelta ?? 0) < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />} {Math.abs(adminData?.hospitalCompliance.trendDelta ?? 0)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${adminData?.hospitalCompliance.rate ?? 0}%`, height: '100%', background: 'linear-gradient(to right, #4ade80, #00b06b)', borderRadius: 999 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#cbd5e0' }}>Goal: 95% Occupational Safety Standard</div>
                </motion.div>

                <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible"
                  whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
                  className="w-full lg:flex-1"
                  style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a5568', fontFamily: 'Public Sans,sans-serif' }}>ANNUAL CLEARANCE PROGRESS</div>
                    <BarChart3 size={18} color="#4299e1" style={{ flexShrink: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20 }}>
                    <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 32, fontWeight: 800, color: '#1f3151', letterSpacing: '-0.02em' }}>{adminData?.annualClearanceProgress.rate ?? 0}%</span>
                    <span style={{ fontSize: 12, color: '#a0aec0' }}>of FY {new Date().getFullYear()}</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <TrendBars data={adminMonthly} />
                  </div>
                  <motion.button onClick={() => setShowAnalytics(true)}
                    whileHover={{ filter: 'brightness(1.1)', scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    style={{ marginTop: 24, width: '100%', padding: '16px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>View Detailed Analytics</span>
                    <span style={{ fontSize: 18 }}>›</span>
                  </motion.button>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" style={{ marginBottom: 24 }}>
                <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible"
                  whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
                  style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                >
                  <Users size={20} color="#4299e1" />
                  <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 12 }}>Total Personnel</div>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 28, fontWeight: 800, color: '#2b6cb0', marginTop: 4 }}>{adminData?.totalPersonnel ?? 0}</div>
                </motion.div>
                <motion.div custom={4} variants={fadeRise} initial="hidden" animate="visible"
                  whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
                  style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                >
                  <AlertCircle size={20} color="#e53e3e" />
                  <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 12 }}>Critical Cases</div>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 28, fontWeight: 800, color: '#e53e3e', marginTop: 4 }}>{adminData?.criticalCases ?? 0}</div>
                </motion.div>
              </div>

              <ReportsExportCard />
            </>
          )
        ) : (
        <>
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible">
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>Staff Health Status Overview</h1>
          <p style={{ fontSize: 14, color: '#718096', marginBottom: 32 }}>Real-time surveillance analytics, personal checkups, and department compliance tracking.</p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6" style={{ marginBottom: 24 }}>
          <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible"
            className="w-full lg:flex-[0_0_64%]"
            style={{ borderRadius: 20, position: 'relative', overflow: 'hidden', background: 'linear-gradient(45deg, #1f3151 0%, #1f3151 40%, #0c4f38 75%, #00703f 100%)', padding: '32px 36px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <span style={{ background: '#111827', borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>SURVEILLANCE PERIOD</span>
              <span style={{ background: '#00b06b', borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>ANNUAL CYCLE: {new Date().getFullYear()}</span>
            </div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 40, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>{staffData?.nextDue ? formatFullDate(staffData.nextDue.date) : '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 700, color: '#68d391', marginBottom: 24, letterSpacing: '0.05em' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#68d391', display: 'inline-block' }} />
              NEXT COMPLIANCE DUE: {staffData?.nextDue ? formatFullDate(staffData.nextDue.date).toUpperCase() : 'N/A'}
            </div>
            <div style={{ background: '#192b3d', borderRadius: 12, padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
              <AlertTriangle size={20} color="#f6ad55" strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a0aec0', marginBottom: 4 }}>PENDING ACTIONS:</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{staffData?.pendingActions ?? '—'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 40 }}>
              {[{ label: 'Department', value: staffData?.department.name ?? '—' }, { label: 'Department Code', value: staffData?.department.code ?? '—' }].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 12, color: '#cbd5e0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600 }}>{item.label}:</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible"
            whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
            className="w-full lg:flex-1"
            style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a5568', marginBottom: 12, fontFamily: 'Public Sans,sans-serif' }}>MY DEPARTMENT COMPLIANCE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 32, fontWeight: 800, color: '#1f3151', letterSpacing: '-0.02em' }}>{staffData?.department.complianceRate ?? 0}% Done</span>
              {(staffData?.department.complianceRate ?? 0) >= 80 ? (
                <span style={{ border: '1px solid #00b06b', color: '#00b06b', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>On Track</span>
              ) : (
                <span style={{ border: '1px solid #f6ad55', color: '#b7791f', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Needs Attention</span>
              )}
            </div>
            <AnimatedRing percent={staffData?.department.complianceRate ?? 0} pendingCount={staffData?.department.pendingStaffCount ?? 0} />
            <motion.button onClick={() => router.push('/compliance')}
              whileHover={{ filter: 'brightness(1.1)', scale: 1.01 }} whileTap={{ scale: 0.98 }}
              style={{ marginTop: 24, width: '100%', padding: '16px 20px', background: '#008d46', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.3 }}>
                <span>INSPECT</span>
                <span>DEPARTMENT STAFF</span>
              </div>
              <span style={{ fontSize: 18 }}>›</span>
            </motion.button>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style={{ marginBottom: 24 }}>
          {staffStatCards.map((card, i) => <StatCard key={card.label} {...card} index={i + 3} />)}
        </div>

        {isUnitHead && (
          <EscalationsCard escalations={escalations} onAcknowledge={handleAcknowledge} acknowledging={acknowledging} />
        )}

        <motion.div custom={7} variants={fadeRise} initial="hidden" animate="visible"
          whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
          className="flex flex-col sm:flex-row items-start sm:items-center gap-6"
          style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
        >
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#f0fff4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={26} color="#38a169" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 18, color: '#1f3151', marginBottom: 4 }}>Are you ready to submit your latest pulmonary laboratory report?</div>
            <div style={{ fontSize: 14, color: '#718096', lineHeight: 1.6 }}>Quickly upload official CXR scans or GeneXpert molecular assays for instant department verification.</div>
          </div>
          <motion.button onClick={() => router.push('/upload')}
            whileHover={{ filter: 'brightness(1.15)', y: -1 }} whileTap={{ scale: 0.98 }}
            className="w-full sm:w-auto"
            style={{ flexShrink: 0, background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, padding: '16px 24px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.4, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          >UPLOAD<br />LABORATORY<br />DOCUMENT</motion.button>
        </motion.div>
        </>
        )}
      </div>
    </>
  )
}
