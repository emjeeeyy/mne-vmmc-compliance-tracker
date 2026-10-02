'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ChevronDown, X, Download, HelpCircle } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getPreciseRole, type PreciseRole } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { SkeletonListRow, SkeletonStaffCard, SkeletonCard } from '@/components/Skeleton'

type Status = 'Cleared' | 'Infiltrate (L)' | 'Not Detected' | 'Detected' | '—'

interface StaffMember {
  name: string; dept: string; id: string; role: string
  xray: Status; genexpert: Status; exam: string; strip: 'red' | 'green'
  slaStatus: 'COMPLIANT' | 'PENDING' | 'NON_COMPLIANT' | 'OVERDUE'
}

/** Backend shape from GET /compliance/tracker, /compliance/employees/:id/dossier, /me/compliance-summary. */
interface TrackerEntry {
  employeeId: string
  fullName: string
  jobTitle: string | null
  department: { id: string; name: string; code: string }
  status: 'COMPLIANT' | 'PENDING' | 'NON_COMPLIANT' | 'OVERDUE'
  clinicalStatus: 'COMPLIANT' | 'CRITICAL' | 'PENDING'
  dueDate: string
  cxrResult: 'CLEARED' | 'INFILTRATE' | 'PENDING' | 'NOT_APPLICABLE'
  genexpertResult: 'NOT_DETECTED' | 'DETECTED' | 'PENDING' | 'NOT_APPLICABLE'
  examDate: string | null
}

function formatExamDate(examDate: string | null) {
  if (!examDate) return '—'
  const d = new Date(examDate)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase().replace(',', ',')
}

function toCxrStatus(result: TrackerEntry['cxrResult']): Status {
  if (result === 'CLEARED') return 'Cleared'
  if (result === 'INFILTRATE') return 'Infiltrate (L)'
  return '—'
}

function toGenexpertStatus(result: TrackerEntry['genexpertResult']): Status {
  if (result === 'NOT_DETECTED') return 'Not Detected'
  if (result === 'DETECTED') return 'Detected'
  return '—'
}

function toStaffMember(entry: TrackerEntry): StaffMember {
  return {
    name: entry.fullName,
    dept: entry.department.name,
    id: entry.employeeId,
    role: entry.jobTitle ?? '',
    xray: toCxrStatus(entry.cxrResult),
    genexpert: toGenexpertStatus(entry.genexpertResult),
    exam: formatExamDate(entry.examDate),
    strip: entry.clinicalStatus === 'CRITICAL' ? 'red' : 'green',
    slaStatus: entry.status,
  }
}

/** SLA-timeline badge (OVERDUE/NON_COMPLIANT) — a separate dimension from the
 * clinical strip above, per the two-status design (someone can be on-time yet
 * CRITICAL, or CRITICAL-free yet OVERDUE). Omitted for PENDING/COMPLIANT since
 * those are the "nothing to flag" states. */
function SlaStatusBadge({ status }: { status: StaffMember['slaStatus'] }) {
  if (status !== 'OVERDUE' && status !== 'NON_COMPLIANT') return null
  const label = status === 'OVERDUE' ? 'Overdue' : 'Non-Compliant'
  return (
    <span style={{ background: '#f1f5f9', color: '#4a5568', border: '1px solid #cbd5e0', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </span>
  )
}

function PulseDot({ alert, color }: { alert: boolean, color: string }) {
  if (!alert) {
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
  }
  return (
    <span style={{ position: 'relative', width: 8, height: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.span
        animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: color, display: 'block' }}
      />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'block', position: 'relative', zIndex: 1 }} />
    </span>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === '—') return <span style={{ color: '#a0aec0', fontSize: 12, paddingRight: 10 }}>—</span>
  const isAlert = status === 'Infiltrate (L)' || status === 'Detected'
  const bgColor = isAlert ? '#fff5f5' : '#f0fff4'
  const textColor = isAlert ? '#c53030' : '#2f855a'
  const borderColor = isAlert ? '#feb2b2' : '#9ae6b4'
  const dotColor = isAlert ? '#e53e3e' : '#38a169'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: bgColor, color: textColor, border: `1px solid ${borderColor}`, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      <PulseDot alert={isAlert} color={dotColor} />
      {status}
    </span>
  )
}

function StaffCard({ staff, index, onView }: { staff: StaffMember; index: number; onView: () => void }) {
  const stripColor = staff.strip === 'red' ? '#e53e3e' : '#38a169'
  const parts = staff.exam !== '—' ? staff.exam.split(' ') : ['—']
  const examMonth = parts[0]
  const examRest = parts.slice(1).join(' ')

  return (
    <motion.div
      custom={index}
      variants={fadeRise}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.08)' }}
      style={{ background: '#fff', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'relative', display: 'flex', flexDirection: 'column' }}
    >
      {/* Thick tapered top arch */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.07 + 0.1 }}
        style={{
          position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
          borderTop: `10px solid ${stripColor}`,
          borderRadius: '24px',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      <div style={{ padding: '32px 24px 24px', zIndex: 1, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 20, fontWeight: 800, color: '#1f3151', lineHeight: 1.1, textTransform: 'uppercase' }}>{staff.name}</div>
          <span style={{ background: '#f1f5f9', color: '#4a5568', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>{staff.dept}</span>
        </div>
        <div style={{ fontSize: 13, color: '#a0aec0', marginBottom: (staff.slaStatus === 'OVERDUE' || staff.slaStatus === 'NON_COMPLIANT') ? 10 : 20, lineHeight: 1.5 }}>
          {staff.id}<br/>{staff.role}
        </div>
        {(staff.slaStatus === 'OVERDUE' || staff.slaStatus === 'NON_COMPLIANT') && (
          <div style={{ marginBottom: 12 }}><SlaStatusBadge status={staff.slaStatus} /></div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#718096', letterSpacing: '0.05em', textTransform: 'uppercase' }}>CHEST X-RAY:</span>
          <StatusBadge status={staff.xray} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 24 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#718096', letterSpacing: '0.05em', textTransform: 'uppercase' }}>GENEXPERT:</span>
          <StatusBadge status={staff.genexpert} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
          {staff.exam !== '—' ? (
            <>
              <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.4 }}>
                Exam: <span style={{ color: '#1f3151', fontWeight: 800 }}>{examMonth}</span><br/><span style={{ color: '#1f3151', fontWeight: 800 }}>{examRest}</span>
              </div>
              <motion.button
                onClick={onView}
                whileHover={{ filter: 'brightness(1.1)', scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}
              >
                View Official<br/>X-Ray PDF
              </motion.button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#a0aec0' }}>—</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function MobileStaffCard({ staff, index, onView }: { staff: StaffMember; index: number; onView: () => void }) {
  const stripColor = staff.strip === 'red' ? '#e53e3e' : '#38a169'
  const initials = staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)

  return (
    <motion.div
      custom={index}
      variants={fadeRise}
      initial="hidden"
      animate="visible"
      style={{ background: '#fff', borderRadius: 20, borderLeft: `5px solid ${stripColor}`, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', padding: 16, position: 'relative', marginBottom: 14 }}
    >
      <span style={{ position: 'absolute', top: 16, right: 16, width: 8, height: 8, borderRadius: '50%', background: stripColor }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, color: '#1f3151', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', lineHeight: 1.2 }}>{staff.name}</div>
          <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{staff.id} • {staff.role}</div>
          {(staff.slaStatus === 'OVERDUE' || staff.slaStatus === 'NON_COMPLIANT') && (
            <div style={{ marginTop: 6 }}><SlaStatusBadge status={staff.slaStatus} /></div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[{ label: 'CXR Result', status: staff.xray }, { label: 'GeneXpert', status: staff.genexpert }].map(f => {
          const isAlert = f.status === 'Infiltrate (L)' || f.status === 'Detected'
          let color = isAlert ? '#c53030' : '#2f855a'
          if (f.status === '—') color = '#a0aec0'
          return (
            <div key={f.label} style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase' }}>{f.status}</div>
            </div>
          )
        })}
      </div>

      <button
        onClick={onView}
        style={{ width: '100%', background: '#111827', color: '#fff', border: 'none', borderRadius: 12, padding: '12px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', cursor: 'pointer' }}
      >
        View Official X-Ray PDF
      </button>
    </motion.div>
  )
}

/** Annual-cycle progress as % of time elapsed between the last exam and the next
 * due date — a real derived value from the two dates the API already returns,
 * not a fabricated metric. Null when there's no exam yet to measure from, or
 * the window is degenerate (due date not after exam date). */
function cycleProgress(examDate: string | null, dueDate: string): number | null {
  if (!examDate) return null
  const start = new Date(examDate).getTime()
  const end = new Date(dueDate).getTime()
  if (!(end > start)) return null
  const pct = Math.round(((Date.now() - start) / (end - start)) * 100)
  return Math.min(100, Math.max(0, pct))
}

function daysUntil(dueDate: string): number {
  const end = new Date(dueDate).setHours(0, 0, 0, 0)
  const now = new Date().setHours(0, 0, 0, 0)
  return Math.round((end - now) / 86400000)
}

function dueDateFootnote(days: number): string {
  if (days > 0) return `Next requirement window opens in ${days} day${days === 1 ? '' : 's'}.`
  if (days === 0) return 'Next requirement is due today.'
  return `Next requirement is ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue.`
}

/** Desktop-only unified dashboard for STAFF's own record — replaces the old
 * StaffCard-in-a-grid layout (a single card stranded in a 3-column grid, mostly
 * empty background) with one full-width panel: header, stat row, cycle
 * progress, actions. Built directly from the TrackerEntry the API returns
 * (not the StaffMember shape StaffCard/MobileStaffCard use) since it needs
 * dueDate and the raw examDate for the progress calculation. */
function MyComplianceDashboard({ record, onView, onUpload }: { record: TrackerEntry; onView: () => void; onUpload: () => void }) {
  const initials = record.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const xray = toCxrStatus(record.cxrResult)
  const genexpert = toGenexpertStatus(record.genexpertResult)
  const hasExam = record.examDate !== null
  const progress = cycleProgress(record.examDate, record.dueDate)
  const due = daysUntil(record.dueDate)

  const pill = record.clinicalStatus === 'CRITICAL'
    ? { label: 'Critical — Review Required', color: '#feb2b2', bg: 'rgba(229,62,62,0.22)' }
    : record.status === 'OVERDUE'
    ? { label: 'Overdue', color: '#feb2b2', bg: 'rgba(229,62,62,0.22)' }
    : record.status === 'NON_COMPLIANT'
    ? { label: 'Non-Compliant', color: '#e2e8f0', bg: 'rgba(203,213,224,0.22)' }
    : record.status === 'PENDING'
    ? { label: 'Pending Review', color: '#f6e05e', bg: 'rgba(246,224,94,0.22)' }
    : { label: 'Compliant This Cycle', color: '#4ade80', bg: 'rgba(74,222,128,0.22)' }

  const statCells: { label: string; node: ReactNode }[] = [
    { label: 'Chest X-Ray', node: <StatusBadge status={xray} /> },
    { label: 'GeneXpert', node: <StatusBadge status={genexpert} /> },
    { label: 'Exam Date', node: <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151' }}>{formatExamDate(record.examDate)}</span> },
    {
      label: 'Next Requirement Due',
      node: (
        <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151' }}>
          {formatExamDate(record.dueDate)}
          <span style={{ display: 'block', fontFamily: 'Public Sans,sans-serif', fontSize: 12, fontWeight: 600, color: '#a0aec0', marginTop: 3 }}>
            {due > 0 ? `In ${due} day${due === 1 ? '' : 's'}` : due === 0 ? 'Due today' : `${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'} overdue`}
          </span>
        </span>
      ),
    },
  ]

  return (
    <motion.div
      custom={0}
      variants={fadeRise}
      initial="hidden"
      animate="visible"
      style={{ background: '#fff', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}
    >
      <div style={{ background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)', color: '#fff', padding: '34px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div style={{ width: 58, height: 58, borderRadius: 14, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 19, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, textTransform: 'uppercase' }}>{record.fullName}</div>
            <div style={{ fontSize: 13, color: '#cbd5e0', marginTop: 4 }}>{record.employeeId} • {record.jobTitle ?? '—'} • {record.department.name}</div>
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: pill.bg, color: pill.color, borderRadius: 999, padding: '7px 16px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: pill.color, display: 'inline-block', flexShrink: 0 }} />
          {pill.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {statCells.map((s, i) => (
          <div key={s.label} style={{ padding: '26px 28px', borderRight: i < statCells.length - 1 ? '1px solid #e2e8f0' : 'none', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{s.label}</div>
            {s.node}
          </div>
        ))}
      </div>

      {progress !== null && (
        <div style={{ padding: '26px 32px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Annual Cycle Progress</span>
            <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#2f855a', flexShrink: 0 }}>{progress}%</span>
          </div>
          <div style={{ height: 10, background: '#f8fafc', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(to right, #2f855a, #008d46)', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 10 }}>{dueDateFootnote(due)}</div>
        </div>
      )}

      <div style={{ padding: '26px 32px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {hasExam && (
          <motion.button
            onClick={onView}
            whileHover={{ filter: 'brightness(1.1)' }}
            whileTap={{ scale: 0.98 }}
            style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1f3151', color: '#fff', border: 'none', borderRadius: 12, padding: '17px 0', minHeight: 44, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }}
          >
            View Official X-Ray PDF
          </motion.button>
        )}
        <motion.button
          onClick={onUpload}
          whileHover={{ background: '#f8fafc' }}
          whileTap={{ scale: 0.98 }}
          style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', color: '#1f3151', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: hasExam ? '15.5px 0' : '17px 0', minHeight: 44, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }}
        >
          Upload New Result
        </motion.button>
      </div>
    </motion.div>
  )
}

/** Mobile-native version of MyComplianceDashboard — same header/stats/progress/actions
 * shape, stacked instead of laid out in a wide header + 4-column row, and with the
 * action buttons stacked full-width instead of side by side (matches MobileStaffCard's
 * own stacked single "View Official X-Ray PDF" button convention). */
function MyComplianceDashboardMobile({ record, onView, onUpload }: { record: TrackerEntry; onView: () => void; onUpload: () => void }) {
  const initials = record.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const xray = toCxrStatus(record.cxrResult)
  const genexpert = toGenexpertStatus(record.genexpertResult)
  const hasExam = record.examDate !== null
  const progress = cycleProgress(record.examDate, record.dueDate)
  const due = daysUntil(record.dueDate)

  const pill = record.clinicalStatus === 'CRITICAL'
    ? { label: 'Critical', color: '#feb2b2', bg: 'rgba(229,62,62,0.22)' }
    : record.status === 'OVERDUE'
    ? { label: 'Overdue', color: '#feb2b2', bg: 'rgba(229,62,62,0.22)' }
    : record.status === 'NON_COMPLIANT'
    ? { label: 'Non-Compliant', color: '#e2e8f0', bg: 'rgba(203,213,224,0.22)' }
    : record.status === 'PENDING'
    ? { label: 'Pending', color: '#f6e05e', bg: 'rgba(246,224,94,0.22)' }
    : { label: 'Compliant', color: '#4ade80', bg: 'rgba(74,222,128,0.22)' }

  return (
    <motion.div
      custom={1}
      variants={fadeRise}
      initial="hidden"
      animate="visible"
      style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}
    >
      <div style={{ background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)', color: '#fff', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.2 }}>{record.fullName}</div>
            <div style={{ fontSize: 12, color: '#cbd5e0', marginTop: 2 }}>{record.employeeId} • {record.jobTitle ?? '—'}</div>
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: pill.bg, color: pill.color, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: pill.color, display: 'inline-block', flexShrink: 0 }} />
          {pill.label}
        </span>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Chest X-Ray</div>
            <StatusBadge status={xray} />
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>GeneXpert</div>
            <StatusBadge status={genexpert} />
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Exam Date</div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151' }}>{formatExamDate(record.examDate)}</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Next Due</div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151' }}>{formatExamDate(record.dueDate)}</div>
          </div>
        </div>

        {progress !== null && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cycle Progress</span>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#2f855a', flexShrink: 0 }}>{progress}%</span>
            </div>
            <div style={{ height: 8, background: '#f8fafc', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(to right, #2f855a, #008d46)', borderRadius: 999 }} />
            </div>
            <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 8 }}>{dueDateFootnote(due)}</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasExam && (
            <button
              onClick={onView}
              style={{ width: '100%', background: '#1f3151', color: '#fff', border: 'none', borderRadius: 12, padding: 12, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              View Official X-Ray PDF
            </button>
          )}
          <button
            onClick={onUpload}
            style={{ width: '100%', background: '#fff', color: '#1f3151', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 12, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Upload New Result
          </button>
        </div>
      </div>
    </motion.div>
  )
}

interface Department { id: string; name: string; code: string }

const ALL_DEPARTMENTS = 'All Departments'

/** Mobile's filter chips fit a couple of shortened department names
 * ("OPD Nursing" -> "Nursing", "Administration" -> "Admin") to save space;
 * any department not in this list just uses its real name unshortened. */
const MOBILE_CHIP_LABEL_OVERRIDES: Record<string, string> = {
  'OPD Nursing': 'Nursing',
  Administration: 'Admin',
}
function toMobileChipLabel(name: string): string {
  return MOBILE_CHIP_LABEL_OVERRIDES[name] ?? name
}

type AdminStatus = 'Compliant' | 'Critical' | 'Pending' | 'Non-Compliant'

interface AdminStaffEntry {
  name: string; dept: string; id: string; status: AdminStatus
}

function toAdminStatus(entry: TrackerEntry): AdminStatus {
  if (entry.clinicalStatus === 'CRITICAL') return 'Critical'
  if (entry.status === 'COMPLIANT') return 'Compliant'
  if (entry.status === 'OVERDUE' || entry.status === 'NON_COMPLIANT') return 'Non-Compliant'
  return 'Pending'
}

function toAdminStaffEntry(entry: TrackerEntry): AdminStaffEntry {
  return {
    name: entry.fullName,
    dept: entry.department.name,
    id: entry.employeeId,
    status: toAdminStatus(entry),
  }
}

const adminStatusStyles: Record<AdminStatus, { bg: string; color: string }> = {
  Compliant: { bg: '#e6f9ee', color: '#008d46' },
  Critical: { bg: '#fff5f5', color: '#c53030' },
  Pending: { bg: '#fffbea', color: '#b7791f' },
  'Non-Compliant': { bg: '#f1f5f9', color: '#4a5568' },
}

/** Desktop admin staff row — a direct scale-up of the mobile Staff Directory
 * row (avatar circle + name/dept/id + status badge), not a re-skin of
 * StaffCard's card-grid shape (colored top strip, centered avatar). Matching
 * staff's desktop *pattern* means reusing card/spacing conventions, not
 * copying a specific staff layout shape onto content mobile already renders
 * as a simple list — see Upload.tsx's Review Queue for the same correction. */
function AdminStaffRow({ staff, index }: { staff: AdminStaffEntry; index: number }) {
  const statusStyle = adminStatusStyles[staff.status]
  return (
    <motion.div
      custom={index}
      variants={fadeRise}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, background: '#f8fafc', marginBottom: 12 }}
    >
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1f3151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 16, color: '#fff', flexShrink: 0 }}>
        {staff.name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{staff.name}</div>
        <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{staff.dept.toUpperCase()} • {staff.id}</div>
      </div>
      <span style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {staff.status}
      </span>
    </motion.div>
  )
}

const statusGuideRows: { label: string; bg: string; border: string; color: string; desc: string }[] = [
  { label: 'COMPLIANT', bg: '#e6f9ee', border: '#9ae6b4', color: '#008d46', desc: 'The staff has successfully submitted a negative CXR or GeneXpert result, and it has been officially signed/stamped by the TB Head. Clearance is valid for the current annual cycle.' },
  { label: 'CRITICAL', bg: '#fff5f5', border: '#feb2b2', color: '#c53030', desc: 'Requires immediate intervention. This means a positive GeneXpert result was uploaded or clinical symptoms were flagged. These personnel are restricted from hospital until further clinical review.' },
  { label: 'PENDING', bg: '#fffbea', border: '#f6e05e', color: '#b7791f', desc: 'Documents have been uploaded by the staff and are currently sitting in your "Review Queue". They are neither cleared nor flagged until you apply your digital signature or reject them.' },
  { label: 'NON-COMPLIANT', bg: '#f1f5f9', border: '#cbd5e0', color: '#4a5568', desc: 'Personnel who have not yet uploaded any documents, or whose submission were rejected by the TB Data Head due to errors (blurred images, expired results, etc.).' },
]

function CustomDropdown({ value, onChange, options }: { value: string, onChange: (v: string) => void, options: string[] }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const close = () => setIsOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [isOpen])

  return (
    <div className="w-full sm:w-60" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', minHeight: 44, border: 'none', borderRadius: 999, fontSize: 14, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', background: '#f8fafc', cursor: 'pointer', outline: 'none' }}
      >
        {value}
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex' }}>
          <ChevronDown size={16} color="#a0aec0" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 8, background: '#fff', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', padding: '8px 0', zIndex: 50, display: 'flex', flexDirection: 'column' }}
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false) }}
                style={{ width: '100%', padding: '12px 20px', minHeight: 44, border: 'none', background: 'transparent', color: value === opt ? '#008d46' : '#4a5568', fontSize: 14, fontFamily: 'Public Sans,sans-serif', textAlign: 'left', cursor: 'pointer', fontWeight: value === opt ? 600 : 400, transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#1f3151' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = value === opt ? '#008d46' : '#4a5568' }}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow — retrying…'
  return fallback
}

export default function Compliance() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState(ALL_DEPARTMENTS)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [preciseRole, setPreciseRole] = useState<PreciseRole | null>(null)
  const [showStatusGuide, setShowStatusGuide] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])

  useEffect(() => {
    api.get<Department[]>('/departments').then(setDepartments).catch(() => {})
  }, [])

  const depts = [ALL_DEPARTMENTS, ...departments.map(d => d.name)]
  const mobileDeptFilters = [
    { label: 'All Units', value: ALL_DEPARTMENTS },
    ...departments.map(d => ({ label: toMobileChipLabel(d.name), value: d.name })),
  ]

  const [tracker, setTracker] = useState<TrackerEntry[]>([])
  const [myRecord, setMyRecord] = useState<TrackerEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')

  useEffect(() => {
    setPreciseRole(getPreciseRole())
  }, [])

  const handleRunScan = async () => {
    setScanning(true)
    setScanMessage('')
    try {
      const result = await api.post<{ recordsProcessed: number; eventsEmitted: Record<string, number> }>('/monitoring/run-scan')
      const totalEvents = Object.values(result.eventsEmitted).reduce((a, b) => a + b, 0)
      setScanMessage(`Scanned ${result.recordsProcessed} records — ${totalEvents} new event${totalEvents === 1 ? '' : 's'}.`)
      setRefreshKey(k => k + 1)
    } catch (err) {
      setScanMessage(apiErrorMessage(err, 'Scan failed. Please try again.'))
    } finally {
      setScanning(false)
    }
  }

  // Punch-list B: STAFF only ever sees their own dossier — the Tracker/Directory
  // (and department filtering) is gated to UNIT_HEAD/ADMIN at the API layer too.
  useEffect(() => {
    if (!preciseRole) return

    if (preciseRole === 'STAFF') {
      let cancelled = false
      setLoading(true)
      setErrorMessage('')
      api
        .get<TrackerEntry>('/me/compliance-summary')
        .then((data) => { if (!cancelled) setMyRecord(data) })
        .catch((err) => { if (!cancelled) setErrorMessage(apiErrorMessage(err, 'Could not load your record.')) })
        .finally(() => { if (!cancelled) setLoading(false) })
      return () => { cancelled = true }
    }

    let cancelled = false
    const timeout = setTimeout(() => {
      setLoading(true)
      setErrorMessage('')
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (dept !== ALL_DEPARTMENTS) {
        const code = departments.find(d => d.name === dept)?.code
        if (code) params.set('department', code)
      }
      const qs = params.toString()
      api
        .get<TrackerEntry[]>(`/compliance/tracker${qs ? `?${qs}` : ''}`)
        .then((data) => { if (!cancelled) setTracker(data) })
        .catch((err) => { if (!cancelled) setErrorMessage(apiErrorMessage(err, 'Could not load the tracker.')) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [preciseRole, search, dept, refreshKey])

  const filtered = tracker.map(toStaffMember)
  const adminFiltered = tracker.map(toAdminStaffEntry)

  if (!preciseRole) return null

  return (
    <div>
      {errorMessage && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: 14, padding: '12px 16px', fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
          {errorMessage}
        </motion.div>
      )}

      {preciseRole === 'STAFF' ? (
        <>
          {/* Mobile-native own-record view (phones, < sm) */}
          <div className="sm:hidden">
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 16 }}>
              <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>My Compliance</h1>
              <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Personal Pulmonary Record</div>
            </motion.div>
            {loading && <SkeletonCard height={180} />}
            {!loading && myRecord && (
              <MyComplianceDashboardMobile
                record={myRecord}
                onView={() => setSelectedStaff(toStaffMember(myRecord))}
                onUpload={() => router.push('/upload')}
              />
            )}
          </div>

          {/* Tablet / desktop own-record view */}
          <div className="hidden sm:block">
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 32 }}>
              <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>My Compliance Record</h1>
              <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Your personal pulmonary surveillance status for the current annual cycle.</p>
            </motion.div>
            {loading && <SkeletonCard height={220} />}
            {!loading && myRecord && (
              <MyComplianceDashboard
                record={myRecord}
                onView={() => setSelectedStaff(toStaffMember(myRecord))}
                onUpload={() => router.push('/upload')}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* Mobile-native tracker (phones, < sm) */}
          <div className="sm:hidden">
            {preciseRole === 'ADMIN' ? (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Staff Directory</h1>
                    <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Real-Time Personnel Status</div>
                  </div>
                  <button onClick={() => setShowStatusGuide(true)} aria-label="Help" style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                    <HelpCircle size={17} />
                  </button>
                </motion.div>

                <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ position: 'relative', marginBottom: 16 }}>
                  <Search size={16} color="#a0aec0" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or Employee ID..."
                    style={{ width: '100%', padding: '13px 16px 13px 42px', border: 'none', borderRadius: 999, fontSize: 13, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', background: '#fff', outline: 'none', boxSizing: 'border-box', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                  />
                </motion.div>

                <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 18, paddingBottom: 2 }}>
                  {mobileDeptFilters.map(f => {
                    const active = dept === f.value
                    return (
                      <button
                        key={f.value}
                        onClick={() => setDept(f.value)}
                        style={{ flexShrink: 0, background: active ? '#1d3d93' : '#fff', color: active ? '#fff' : '#718096', border: 'none', borderRadius: 999, padding: '10px 18px', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: active ? 'none' : '0 2px 6px rgba(0,0,0,0.04)' }}
                      >
                        {f.label.toUpperCase()}
                      </button>
                    )
                  })}
                </motion.div>

                {loading && [0, 1, 2, 3, 4].map(i => <SkeletonListRow key={i} />)}
                {!loading && adminFiltered.map((s, i) => {
                  const statusStyle = adminStatusStyles[s.status]
                  return (
                    <motion.div key={s.id} custom={i + 3} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1f3151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {s.name[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{s.dept.toUpperCase()} • {s.id}</div>
                      </div>
                      <span style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {s.status}
                      </span>
                    </motion.div>
                  )
                })}
                {!loading && adminFiltered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>No results found.</div>
                )}
              </>
            ) : (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 16 }}>
                  <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Tracker</h1>
                  <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Department Database</div>
                </motion.div>

                {loading && [0, 1, 2, 3, 4].map(i => <SkeletonListRow key={i} />)}
                {!loading && filtered.map((staff, i) => (
                  <MobileStaffCard key={staff.id + staff.name} staff={staff} index={i + 1} onView={() => setSelectedStaff(staff)} />
                ))}
                {!loading && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>No results found.</div>
                )}
              </>
            )}
          </div>

          {/* Tablet / desktop tracker */}
          <div className="hidden sm:block">
            {preciseRole === 'ADMIN' ? (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
                  <div>
                    <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Staff Directory</h1>
                    <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Real-time hospital-wide personnel compliance status across clinical sectors.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    <button
                      onClick={handleRunScan}
                      disabled={scanning}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1f3151', border: 'none', borderRadius: 999, padding: '10px 18px', minHeight: 44, cursor: scanning ? 'default' : 'pointer', color: '#fff', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', opacity: scanning ? 0.75 : 1 }}
                    >
                      {scanning ? 'Scanning…' : 'Run Compliance Scan'}
                    </button>
                    <button onClick={() => setShowStatusGuide(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '10px 18px', minHeight: 44, cursor: 'pointer', color: '#4a5568', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <HelpCircle size={16} /> Status Guide
                    </button>
                  </div>
                </motion.div>
                {scanMessage && (
                  <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 12, fontWeight: 700, color: '#4a5568', marginTop: -24, marginBottom: 24 }}>
                    {scanMessage}
                  </motion.p>
                )}

                <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 rounded-3xl sm:rounded-full" style={{ marginBottom: 32, background: '#fff', padding: '16px 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
                  <div className="w-full sm:flex-1" style={{ position: 'relative' }}>
                    <Search size={16} color="#a0aec0" style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name or Employee ID.."
                      style={{ width: '100%', padding: '14px 20px 14px 48px', border: 'none', borderRadius: 999, fontSize: 14, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', background: '#f8fafc', outline: 'none' }}
                    />
                  </div>
                  <CustomDropdown value={dept} onChange={setDept} options={depts} />
                </motion.div>

                <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 24 }}>STAFF DIRECTORY</div>
                  {loading && [0, 1, 2, 3, 4, 5].map(i => <SkeletonListRow key={i} />)}
                  {!loading && adminFiltered.map((staff, i) => <AdminStaffRow key={staff.id + staff.name} staff={staff} index={i} />)}
                  {!loading && adminFiltered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0aec0', fontSize: 14 }}>No results found.</div>
                  )}
                </motion.div>
              </>
            ) : (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Staff Pulmonary Registry</h1>
                  <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Filter, inspect, and evaluate surveillance compliance status of personnel in your department.</p>
                </motion.div>

                <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 rounded-3xl sm:rounded-full" style={{ marginBottom: 32, background: '#fff', padding: '16px 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
                  <div className="w-full sm:flex-1" style={{ position: 'relative' }}>
                    <Search size={16} color="#a0aec0" style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search employee or peer compliance state.."
                      style={{ width: '100%', padding: '14px 20px 14px 48px', border: 'none', borderRadius: 999, fontSize: 14, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', background: '#f8fafc', outline: 'none' }}
                    />
                  </div>
                </motion.div>

                {loading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[0, 1, 2, 3, 4, 5].map(i => <SkeletonStaffCard key={i} />)}
                  </div>
                )}
                {!loading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map((staff, i) => <StaffCard key={staff.id + staff.name} staff={staff} index={i} onView={() => setSelectedStaff(staff)} />)}
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-body)', fontSize: 14 }}>No results found.</div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {selectedStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(4px)' }}
            onClick={() => setSelectedStaff(null)}
          >
            {/* Mobile-native staff record card (phones, < sm) */}
            <motion.div
              className="sm:hidden"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 360, padding: 22, boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Staff Record</span>
                <button onClick={() => setSelectedStaff(null)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', flexShrink: 0 }}>
                  {selectedStaff.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedStaff.name}</div>
                  <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{selectedStaff.id} • {selectedStaff.role}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {([
                  { label: 'Chest X-Ray', status: selectedStaff.xray },
                  { label: 'GeneXpert', status: selectedStaff.genexpert },
                ] as const).map(f => {
                  const isAlert = f.status === 'Infiltrate (L)' || f.status === 'Detected'
                  const color = f.status === '—' ? '#a0aec0' : isAlert ? '#c53030' : '#2f855a'
                  return (
                    <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{f.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase' }}>{f.status}</span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Department</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedStaff.dept}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Last Exam Date</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedStaff.exam !== '—' ? selectedStaff.exam.replace(' ', '. ') : '—'}</span>
                </div>
              </div>

              <button
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: '#008d46', color: '#fff', border: 'none', borderRadius: 14, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Download Full PDF Report
              </button>
            </motion.div>

            {/* Tablet / desktop staff record card */}
            <motion.div
              className="hidden sm:block"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.2)', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ background: '#1c2538', padding: '28px 32px' }}>
                <button onClick={() => setSelectedStaff(null)} style={{ position: 'absolute', top: 16, right: 16, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0' }}>
                  <X size={20} />
                </button>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  VETERANS MEMORIAL MEDICAL CENTER
                </div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#fff' }}>
                  Official Staff Record
                </div>
              </div>

              <div style={{ padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151' }}>
                    {selectedStaff.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', marginBottom: 2 }}>{selectedStaff.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{selectedStaff.id} • {selectedStaff.role}</div>
                  </div>
                </div>

                <div style={{ height: 1, background: '#e2e8f0', marginBottom: 24 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>CHEST X-RAY:</span>
                    <StatusBadge status={selectedStaff.xray} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>GENEXPERT:</span>
                    <StatusBadge status={selectedStaff.genexpert} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DEPARTMENT:</span>
                    <span style={{ background: '#e2e8f0', color: '#1f3151', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{selectedStaff.dept}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>LAST EXAM DATE:</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedStaff.exam !== '—' ? selectedStaff.exam.replace(' ', '. ') : '—'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <motion.button
                    whileHover={{ filter: 'brightness(1.1)', scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px', background: '#008d46', color: '#fff', border: 'none', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    <Download size={16} strokeWidth={2.5} /> DOWNLOAD FULL PDF REPORT
                  </motion.button>
                  <motion.button
                    onClick={() => setSelectedStaff(null)}
                    whileHover={{ background: '#e2e8f0' }}
                    whileTap={{ scale: 0.98 }}
                    style={{ width: '100%', padding: '14px', background: '#f8fafc', color: '#718096', border: 'none', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.2s' }}
                  >
                    CANCEL
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStatusGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={() => setShowStatusGuide(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 360, padding: 22, boxShadow: '0 24px 48px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151', letterSpacing: '0.02em' }}>STATUS DIFFERENCE GUIDE</span>
                <button onClick={() => setShowStatusGuide(false)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {statusGuideRows.map(row => (
                  <div key={row.label} style={{ background: row.bg, border: `1px solid ${row.border}`, borderRadius: 14, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: row.color, letterSpacing: '0.04em', marginBottom: 6 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.5 }}>{row.desc}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
