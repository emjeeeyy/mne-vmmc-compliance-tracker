'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Download, HelpCircle, FileText, FileCheck, Folder, CalendarDays, UserCheck, ShieldCheck } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getPreciseRole, type PreciseRole } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { SkeletonListRow, SkeletonStaffCard } from '@/components/Skeleton'
import ModulesRegistry from './ModulesRegistry'

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
  if (status === '—') return <span style={{ color: '#5f6b7d', fontSize: 12, paddingRight: 10 }}>—</span>
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
        <div style={{ fontSize: 13, color: '#5f6b7d', marginBottom: (staff.slaStatus === 'OVERDUE' || staff.slaStatus === 'NON_COMPLIANT') ? 10 : 20, lineHeight: 1.5 }}>
          {staff.id}<br/>{staff.role}
        </div>
        {(staff.slaStatus === 'OVERDUE' || staff.slaStatus === 'NON_COMPLIANT') && (
          <div style={{ marginBottom: 12 }}><SlaStatusBadge status={staff.slaStatus} /></div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#5f6b7d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>CHEST X-RAY:</span>
          <StatusBadge status={staff.xray} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 24 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#5f6b7d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>GENEXPERT:</span>
          <StatusBadge status={staff.genexpert} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
          {staff.exam !== '—' ? (
            <>
              <div style={{ fontSize: 12, color: '#5f6b7d', lineHeight: 1.4 }}>
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
            <div style={{ fontSize: 12, color: '#5f6b7d' }}>—</div>
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
          <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2 }}>{staff.id} • {staff.role}</div>
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
              <div style={{ fontSize: 12, fontWeight: 800, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{f.label}</div>
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

/** Backend shape from GET /me/documents (the owner's own history, including review outcome). */
interface MyDocument {
  id: string
  docType: string
  cxrResult: TrackerEntry['cxrResult']
  genexpertResult: TrackerEntry['genexpertResult']
  title: string | null
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  uploadedAt: string
  reviewedBy: string | null
  rejectionReason: string | null
  reviewNotes?: string | null
}

function documentTitle(doc: MyDocument) {
  if (doc.title?.trim()) return doc.title.trim()
  if (doc.docType === 'HEPB_TITER') return 'Hepatitis B Titer'
  const hasCxr = doc.cxrResult !== 'NOT_APPLICABLE'
  const hasGenexpert = doc.genexpertResult !== 'NOT_APPLICABLE'
  if (hasCxr && hasGenexpert) return 'Chest X-Ray & GeneXpert Result'
  if (hasCxr) return 'Chest X-Ray Result'
  if (hasGenexpert) return 'GeneXpert Result'
  return 'Laboratory Report'
}

/** Documents have UUIDs, not a sequential number — a short, stable reference derived from the id
 * gives staff something to quote to the TB DOTS Unit, like the mockup's "DOC-904". */
const documentRef = (id: string) => `DOC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
const categoryLabel = (docType: string) => (docType === 'HEPB_TITER' ? 'Hep B Titer' : 'APE Exam')
const submittedOn = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
// Pending rows name the reviewing unit (as the mockup does); so do older reviewed rows that predate reviewer tracking.
const verifiedBy = (doc: MyDocument) => (doc.reviewStatus === 'PENDING' ? 'TB DOTS Reviewer' : doc.reviewedBy ?? 'TB DOTS Reviewer')

const historyStatus: Record<MyDocument['reviewStatus'], { label: string; bg: string; color: string; border: string }> = {
  PENDING: { label: 'Pending Verification', bg: '#fef2c0', color: '#852202', border: '#fde68a' },
  APPROVED: { label: 'Verified & Cleared', bg: '#e0f3e6', color: '#004b2b', border: '#bfe5cc' },
  REJECTED: { label: 'Rejected', bg: '#fff1f0', color: '#b42318', border: '#fecdca' },
}

function StatusGlyph({ status, color }: { status: MyDocument['reviewStatus']; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill={color} />
      {status === 'APPROVED' && <path d="M4.6 8.2 7 10.5l4.4-4.6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'PENDING' && <path d="M8 4.3V8.3l2.6 1.4" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'REJECTED' && <path d="m5.5 5.5 5 5m0-5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}

function HistoryStatusPill({ status }: { status: MyDocument['reviewStatus'] }) {
  const s = historyStatus[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px 0 8px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <StatusGlyph status={status} color={s.color} />
      {s.label}
    </span>
  )
}

const HISTORY_COLUMNS: { label: string; width: string; icon: ReactNode }[] = [
  // Mockup proportions, except Status gets ~2.5% more so the widest pill still fits at 1024px.
  { label: 'Document Title', width: '26.5%', icon: <FileText size={15} color="#788ba5" fill="#dbe3ee" /> },
  { label: 'Category', width: '13.4%', icon: <Folder size={15} color="#788ba5" fill="#788ba5" /> },
  { label: 'Submitted On', width: '16.4%', icon: <CalendarDays size={15} color="#788ba5" /> },
  { label: 'Verified By', width: '21.7%', icon: <UserCheck size={15} color="#788ba5" /> },
  { label: 'Status', width: '22%', icon: <ShieldCheck size={15} color="#788ba5" fill="#dbe3ee" /> },
]

/** Staff's "My Clearance & Logs": every document they've submitted and where its verification stands.
 * Layout measured from the mockup at 1440 (4vw side margins, 54px header row, 75px rows). */
function MySubmissionHistory({ documents, loading, onUpload }: { documents: MyDocument[]; loading: boolean; onUpload: () => void }) {
  const empty = !loading && documents.length === 0
  return (
    <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12 sm:px-6 lg:px-[4vw]" style={{ paddingTop: 'clamp(0px, 2.3vw, 44px)', fontFamily: 'Poppins,sans-serif' }}>
      <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible"
        style={{ background: '#fff', borderRadius: 18, padding: '26px 30px', boxShadow: '0 4px 8px rgba(15,23,42,0.2)' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 16px 0 12px', borderRadius: 999, background: '#fef2c0', color: '#841f00', fontSize: 12, fontWeight: 600 }}>
          <FileCheck size={14} strokeWidth={2.4} aria-hidden="true" /> Submission History
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: '16px 0 0' }}>My Submitted Documents &amp; Verification Status</h1>
        <p style={{ fontSize: 13, color: '#55667e', lineHeight: 1.5, margin: '4px 0 0' }}>Track the real-time status of health documents you have submitted to the TB DOTS Unit for verification.</p>
      </motion.div>

      {/* Laptop / desktop: the mockup's table. Below lg the Status column would be scrolled out of view,
          so smaller screens get the card list instead; the minWidth is only a safety net. */}
      <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="hidden lg:block"
        style={{ marginTop: 24, background: '#fff', borderRadius: 16, border: '1px solid #e5e9f0', boxShadow: '0 4px 8px rgba(15,23,42,0.14)', overflow: 'hidden' }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <caption className="sr-only">Your submitted health documents and their verification status</caption>
            <colgroup>{HISTORY_COLUMNS.map(c => <col key={c.label} style={{ width: c.width }} />)}</colgroup>
            <thead>
              <tr style={{ background: '#f4f7fb', height: 54 }}>
                {HISTORY_COLUMNS.map((c, i) => (
                  <th key={c.label} scope="col" style={{ textAlign: 'left', padding: i === 0 ? '0 12px 0 20px' : '0 12px', fontSize: 13, fontWeight: 600, color: '#1a2b41', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{c.icon}{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [0, 1, 2].map(i => (
                <tr key={i} style={{ height: 75, borderTop: '1px solid #eef1f5' }}>
                  <td colSpan={5} style={{ padding: '0 27px' }}><div style={{ height: 14, width: `${60 - i * 12}%`, borderRadius: 6, background: '#eef1f5' }} /></td>
                </tr>
              ))}
              {!loading && documents.map(doc => (
                <tr key={doc.id} style={{ height: 75, borderTop: '1px solid #eef1f5' }}>
                  <td style={{ padding: '12px 12px 12px 27px' }}>
                    <div title={documentTitle(doc)} style={{ fontSize: 14, fontWeight: 600, color: '#111111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{documentTitle(doc)}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, letterSpacing: '0.02em' }}>{documentRef(doc.id)}</div>
                  </td>
                  <td style={{ padding: '0 12px' }}>
                    <span style={{ display: 'inline-block', background: '#eef3f8', color: '#262c38', borderRadius: 6, padding: '5px 16px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{categoryLabel(doc.docType)}</span>
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 14, color: '#5f6368', whiteSpace: 'nowrap' }}>{submittedOn(doc.uploadedAt)}</td>
                  <td style={{ padding: '0 12px', fontSize: 14, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{verifiedBy(doc)}</td>
                  <td style={{ padding: '12px 12px 12px 12px' }}>
                    <HistoryStatusPill status={doc.reviewStatus} />
                    {doc.reviewStatus === 'REJECTED' && doc.rejectionReason && (
                      <div style={{ fontSize: 12, color: '#b42318', marginTop: 4, lineHeight: 1.35 }}>Reason: {doc.rejectionReason}</div>
                    )}
                    {doc.reviewStatus === 'APPROVED' && doc.reviewNotes && (
                      <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4, lineHeight: 1.35 }}>Reviewer note: {doc.reviewNotes}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {empty && <EmptyHistory onUpload={onUpload} />}
      </motion.div>

      {/* Phones and tablets: the same rows as cards (one column on phones, two on tablets). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 sm:mt-6 lg:hidden">
        {loading && [0, 1].map(i => <div key={i} style={{ height: 96, borderRadius: 14, background: '#fff', border: '1px solid #e5e9f0' }} />)}
        {!loading && documents.map(doc => (
          <div key={doc.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e9f0', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111111' }}>{documentTitle(doc)}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{documentRef(doc.id)} · {categoryLabel(doc.docType)}</div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}><HistoryStatusPill status={doc.reviewStatus} /></div>
            {doc.reviewStatus === 'REJECTED' && doc.rejectionReason && (
              <div style={{ fontSize: 12, color: '#b42318', marginTop: 6 }}>Reason: {doc.rejectionReason}</div>
            )}
            {doc.reviewStatus === 'APPROVED' && doc.reviewNotes && (
              <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6 }}>Reviewer note: {doc.reviewNotes}</div>
            )}
            <div style={{ fontSize: 12, color: '#5f6368', marginTop: 10 }}>Submitted {submittedOn(doc.uploadedAt)} · {verifiedBy(doc)}</div>
          </div>
        ))}
        {empty && <div className="sm:col-span-2" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e9f0' }}><EmptyHistory onUpload={onUpload} /></div>}
      </div>
    </div>
  )
}

function EmptyHistory({ onUpload }: { onUpload: () => void }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>No submissions yet</div>
      <div style={{ fontSize: 13, color: '#5f6b7d', marginTop: 4 }}>Documents you submit to the TB DOTS Unit will appear here with their verification status.</div>
      <button onClick={onUpload} style={{ marginTop: 16, height: 40, padding: '0 22px', background: '#006042', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        Submit Health Documents
      </button>
    </div>
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

const statusGuideRows: { label: string; bg: string; border: string; color: string; desc: string }[] = [
  { label: 'COMPLIANT', bg: '#e6f9ee', border: '#9ae6b4', color: '#008d46', desc: 'The staff has successfully submitted a negative CXR or GeneXpert result, and it has been officially signed/stamped by the TB Head. Clearance is valid for the current annual cycle.' },
  { label: 'CRITICAL', bg: '#fff5f5', border: '#feb2b2', color: '#c53030', desc: 'Requires immediate intervention. This means a positive GeneXpert result was uploaded or clinical symptoms were flagged. These personnel are restricted from hospital until further clinical review.' },
  { label: 'PENDING', bg: '#fffbea', border: '#f6e05e', color: '#b7791f', desc: 'Documents have been uploaded by the staff and are currently sitting in your "Review Queue". They are neither cleared nor flagged until you apply your digital signature or reject them.' },
  { label: 'NON-COMPLIANT', bg: '#f1f5f9', border: '#cbd5e0', color: '#4a5568', desc: 'Personnel who have not yet uploaded any documents, or whose submission were rejected by the TB Data Head due to errors (blurred images, expired results, etc.).' },
]

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

  const mobileDeptFilters = [
    { label: 'All Units', value: ALL_DEPARTMENTS },
    ...departments.map(d => ({ label: toMobileChipLabel(d.name), value: d.name })),
  ]

  const [tracker, setTracker] = useState<TrackerEntry[]>([])
  const [myDocuments, setMyDocuments] = useState<MyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setPreciseRole(getPreciseRole())
  }, [])

  // Punch-list B: STAFF only ever sees their own dossier — the Tracker/Directory
  // (and department filtering) is gated to UNIT_HEAD/ADMIN at the API layer too.
  useEffect(() => {
    if (!preciseRole) return

    if (preciseRole === 'STAFF') {
      let cancelled = false
      setLoading(true)
      setErrorMessage('')
      api
        .get<MyDocument[]>('/me/documents')
        .then((data) => { if (!cancelled) setMyDocuments(data) })
        .catch((err) => { if (!cancelled) setErrorMessage(apiErrorMessage(err, 'Could not load your submissions.')) })
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
  }, [preciseRole, search, dept])

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
        <MySubmissionHistory documents={myDocuments} loading={loading} onUpload={() => router.push('/upload')} />
      ) : (
        <>
          {/* Mobile-native tracker (phones, < sm) */}
          <div className="sm:hidden">
            {preciseRole === 'ADMIN' ? (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Staff Directory</h1>
                    <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Real-Time Personnel Status</div>
                  </div>
                  <button onClick={() => setShowStatusGuide(true)} aria-label="Help" style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6b7d', flexShrink: 0 }}>
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
                        <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2 }}>{s.dept.toUpperCase()} • {s.id}</div>
                      </div>
                      <span style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {s.status}
                      </span>
                    </motion.div>
                  )
                })}
                {!loading && adminFiltered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#5f6b7d', fontSize: 13 }}>No results found.</div>
                )}
              </>
            ) : (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 16 }}>
                  <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Tracker</h1>
                  <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Department Database</div>
                </motion.div>

                {loading && [0, 1, 2, 3, 4].map(i => <SkeletonListRow key={i} />)}
                {!loading && filtered.map((staff, i) => (
                  <MobileStaffCard key={staff.id + staff.name} staff={staff} index={i + 1} onView={() => setSelectedStaff(staff)} />
                ))}
                {!loading && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#5f6b7d', fontSize: 13 }}>No results found.</div>
                )}
              </>
            )}
          </div>

          {/* Tablet / desktop tracker */}
          <div className="hidden sm:block">
            {preciseRole === 'ADMIN' ? (
              <ModulesRegistry />
            ) : (
              <>
                <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 32 }}>
                  <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Staff Pulmonary Registry</h1>
                  <p style={{ fontSize: 14, color: '#5f6b7d', marginBottom: 0 }}>Filter, inspect, and evaluate surveillance compliance status of personnel in your department.</p>
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
                <button onClick={() => setSelectedStaff(null)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6b7d', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', flexShrink: 0 }}>
                  {selectedStaff.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedStaff.name}</div>
                  <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2 }}>{selectedStaff.id} • {selectedStaff.role}</div>
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
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{f.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase' }}>{f.status}</span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Department</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedStaff.dept}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Last Exam Date</span>
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
                <button onClick={() => setSelectedStaff(null)} style={{ position: 'absolute', top: 16, right: 16, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#5f6b7d' }}>
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
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{selectedStaff.id} • {selectedStaff.role}</div>
                  </div>
                </div>

                <div style={{ height: 1, background: '#e2e8f0', marginBottom: 24 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>CHEST X-RAY:</span>
                    <StatusBadge status={selectedStaff.xray} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>GENEXPERT:</span>
                    <StatusBadge status={selectedStaff.genexpert} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DEPARTMENT:</span>
                    <span style={{ background: '#e2e8f0', color: '#1f3151', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{selectedStaff.dept}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>LAST EXAM DATE:</span>
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
                    style={{ width: '100%', padding: '14px', background: '#f8fafc', color: '#5f6b7d', border: 'none', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.2s' }}
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
                <button onClick={() => setShowStatusGuide(false)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6b7d', flexShrink: 0 }}>
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
