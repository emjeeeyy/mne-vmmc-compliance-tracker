'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { FileCheck, FileText, X, Clock, Eye, Check, User, Building2, Folder, FlaskConical, CalendarDays, ShieldCheck, ChevronDown, ExternalLink } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { api, ApiError, ApiConnectionError } from '@/lib/api'

export interface ReviewQueueEntry {
  id: string
  docType: string
  cxrResult: 'CLEARED' | 'INFILTRATE' | 'PENDING' | 'NOT_APPLICABLE'
  genexpertResult: 'NOT_DETECTED' | 'DETECTED' | 'PENDING' | 'NOT_APPLICABLE'
  titerResult: 'REACTIVE' | 'NON_REACTIVE' | 'NOT_APPLICABLE'
  title: string | null
  facilityName: string | null
  notes: string | null
  examDate: string | null
  uploadedAt: string
  dueDate: string | null
  employee: { id: string; employeeId: string; fullName: string; jobTitle: string | null; department: string }
}

export type ReviewAction = 'approve' | 'reject'

const GREEN = '#006042'
const documentRef = (id: string) => `DOC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
const isoDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
const dueText = (d: string | null) => (d ? d.slice(0, 10) : '—')

function documentLabel(item: ReviewQueueEntry) {
  if (item.title?.trim()) return item.title.trim()
  if (item.docType === 'HEPB_TITER') return 'Hepatitis B Titer'
  const cxr = item.cxrResult !== 'NOT_APPLICABLE'
  const gx = item.genexpertResult !== 'NOT_APPLICABLE'
  if (cxr && gx) return 'Chest X-Ray & GeneXpert Result'
  if (cxr) return 'Chest X-Ray Result'
  if (gx) return 'GeneXpert Result'
  return 'Laboratory Report'
}

/** What kind of document this is, as chips: the results it reports (a document can report both), or Hep B. */
function categoryChips(item: ReviewQueueEntry): { label: string; bg: string; fg: string }[] {
  if (item.docType === 'HEPB_TITER') return [{ label: 'HEP B', bg: '#fef3c7', fg: '#78350f' }]
  const chips: { label: string; bg: string; fg: string }[] = []
  if (item.cxrResult !== 'NOT_APPLICABLE') chips.push({ label: 'CXR', bg: '#dbeafe', fg: '#1e3a8a' })
  if (item.genexpertResult !== 'NOT_APPLICABLE') chips.push({ label: 'GENEXPERT', bg: '#f3e8ff', fg: '#581c87' })
  return chips.length > 0 ? chips : [{ label: 'APE', bg: '#d1fae5', fg: '#065f46' }]
}

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow or unavailable. Please try again.'
  return fallback
}

function Chips({ item }: { item: ReviewQueueEntry }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {categoryChips(item).map(c => (
        <span key={c.label} style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '4px 11px', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>{c.label}</span>
      ))}
    </span>
  )
}

function PendingPill() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px 0 11px', borderRadius: 999, background: '#fef2c0', color: '#852202', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <Clock size={15} aria-hidden="true" /> Pending Review
    </span>
  )
}

const COLUMNS: { label: string; width: string; align: 'left' | 'center'; icon: ReactNode | null }[] = [
  { label: 'Staff Member', width: '18%', align: 'left', icon: <User size={16} color="#788ba5" aria-hidden="true" /> },
  { label: 'Department', width: '11%', align: 'left', icon: <Building2 size={16} color="#788ba5" aria-hidden="true" /> },
  { label: 'Category', width: '13%', align: 'center', icon: <Folder size={16} color="#788ba5" aria-hidden="true" /> },
  { label: 'File Title / Reference', width: '19%', align: 'left', icon: <FlaskConical size={16} color="#788ba5" aria-hidden="true" /> },
  { label: 'Due Schedule', width: '11%', align: 'left', icon: <CalendarDays size={16} color="#788ba5" aria-hidden="true" /> },
  { label: 'Status', width: '14%', align: 'center', icon: <ShieldCheck size={16} color="#788ba5" aria-hidden="true" /> },
  { label: 'Actions', width: '14%', align: 'center', icon: null },
]

function ViewVerifyButton({ item, onOpen }: { item: ReviewQueueEntry; onOpen: (item: ReviewQueueEntry, action: ReviewAction) => void }) {
  return (
    <button onClick={() => onOpen(item, 'approve')} aria-label={`View and verify ${documentLabel(item)} from ${item.employee.fullName}`}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 16px', border: 'none', borderRadius: 8, background: GREEN, color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      <Eye size={16} aria-hidden="true" /> View &amp; Verify
    </button>
  )
}

/** Admin "Document Verification": the pending-documents table (laptop and up) or cards (below), per the mockup. */
export function ReviewQueueTable({ queue, loading, error, onOpen }: { queue: ReviewQueueEntry[]; loading: boolean; error: string; onOpen: (item: ReviewQueueEntry, action: ReviewAction) => void }) {
  const empty = !loading && !error && queue.length === 0
  return (
    <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12 sm:px-6 lg:px-[4vw]" style={{ paddingTop: 'clamp(0px, 2.3vw, 44px)', fontFamily: 'Poppins,sans-serif' }}>
      <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible"
        style={{ background: '#fff', borderRadius: 18, padding: '26px 30px', boxShadow: '0 4px 8px rgba(15,23,42,0.2)' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 16px 0 12px', borderRadius: 999, background: '#fef2c0', color: '#841f00', fontSize: 13, fontWeight: 600 }}>
          <FileCheck size={15} strokeWidth={2.4} aria-hidden="true" /> Document Review Portal
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: '16px 0 0' }}>Diagnostic &amp; Medical Document Approvals Queue</h1>
        <p style={{ fontSize: 13, color: '#55667e', lineHeight: 1.5, margin: '4px 0 0' }}>Review uploaded Chest Radiographs (CXR), GeneXpert, Sputum Smear, Hep B Titer, and Physical Exam forms uploaded by staff.</p>
      </motion.div>

      {error && <div role="alert" style={{ marginTop: 20, background: '#fff5f5', border: '1px solid #feb2b2', color: '#9b1c1c', borderRadius: 12, padding: '14px 18px', fontSize: 13, fontWeight: 600 }}>{error}</div>}

      <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="hidden xl:block"
        style={{ marginTop: 24, background: '#fff', borderRadius: 16, border: '1px solid #e5e9f0', boxShadow: '0 4px 8px rgba(15,23,42,0.14)', overflow: 'hidden' }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1020, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <caption className="sr-only">Documents waiting for review</caption>
            <colgroup>{COLUMNS.map(c => <col key={c.label} style={{ width: c.width }} />)}</colgroup>
            <thead>
              <tr style={{ background: '#f4f7fb', height: 52 }}>
                {COLUMNS.map((c, i) => (
                  <th key={c.label} scope="col" style={{ textAlign: c.align, padding: i === 0 ? '0 12px 0 22px' : '0 12px', fontSize: 13, fontWeight: 600, color: '#1a2b41', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{c.icon}{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [0, 1, 2].map(i => (
                <tr key={i} style={{ height: 72, borderTop: '1px solid #eef1f5' }}><td colSpan={7} style={{ padding: '0 22px' }}><div style={{ height: 14, width: `${70 - i * 14}%`, borderRadius: 6, background: '#eef1f5' }} /></td></tr>
              ))}
              {!loading && queue.map(item => (
                <tr key={item.id} style={{ height: 72, borderTop: '1px solid #eef1f5' }}>
                  <td style={{ padding: '10px 12px 10px 22px' }}>
                    <div title={item.employee.fullName} style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.employee.fullName}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{item.employee.employeeId}</div>
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.employee.department}>{item.employee.department}</td>
                  <td style={{ padding: '0 12px', textAlign: 'center' }}><Chips item={item} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <div title={documentLabel(item)} style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{documentLabel(item)}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{documentRef(item.id)}</div>
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13, color: '#4b5563', whiteSpace: 'nowrap' }}>{dueText(item.dueDate)}</td>
                  <td style={{ padding: '0 12px', textAlign: 'center' }}><PendingPill /></td>
                  <td style={{ padding: '0 12px', textAlign: 'center' }}><ViewVerifyButton item={item} onOpen={onOpen} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {empty && <EmptyQueue />}
      </motion.div>

      {/* Below laptop width: the same documents as cards, each with the two actions the mockup shows. Both open the
          verification window (the reviewer always sees the file first); they only pre-select the decision. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 sm:mt-6 xl:hidden">
        {loading && [0, 1].map(i => <div key={i} style={{ height: 150, borderRadius: 14, background: '#fff', border: '1px solid #e5e9f0' }} />)}
        {!loading && queue.map(item => (
          <div key={item.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e9f0', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{documentLabel(item)}</div>
                <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>Submitted by: <strong style={{ fontWeight: 600 }}>{item.employee.fullName}</strong> ({item.employee.employeeId} · {item.employee.department})</div>
              </div>
              <Chips item={item} />
            </div>
            {item.notes && <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: 13, fontStyle: 'italic', color: '#374151' }}>&ldquo;{item.notes}&rdquo;</div>}
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 10 }}>Uploaded {isoDay(item.uploadedAt)} · Due {dueText(item.dueDate)} · {documentRef(item.id)}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button onClick={() => onOpen(item, 'approve')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', border: 'none', borderRadius: 8, background: GREEN, color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Check size={16} aria-hidden="true" /> Verify &amp; Clear</button>
              <button onClick={() => onOpen(item, 'reject')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', border: 'none', borderRadius: 8, background: '#ffe4e6', color: '#9f1239', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><X size={16} aria-hidden="true" /> Request Re-upload</button>
            </div>
          </div>
        ))}
        {empty && <div className="sm:col-span-2" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e9f0' }}><EmptyQueue /></div>}
      </div>
    </div>
  )
}

function EmptyQueue() {
  return (
    <div style={{ padding: '44px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>You&apos;re all caught up</div>
      <div style={{ fontSize: 13, color: '#5f6b7d', marginTop: 4 }}>No documents are waiting for review.</div>
    </div>
  )
}

const fieldLabel = { display: 'block', fontSize: 13, fontWeight: 500, color: '#454545', marginBottom: 8 } as const
const inputBase = { width: '100%', border: '1px solid #e2e6ec', borderRadius: 12, background: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, color: '#1f2937', boxSizing: 'border-box' } as const
const focusRing = 'outline-none placeholder:text-[#767676] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006042]'

function DetailRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, padding: '6px 0' }}>
      <span style={{ color: '#5f6b7d' }}>{label}</span>
      <strong style={{ color: danger ? '#b42318' : '#111827', fontWeight: 600, textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

const pretty = (v: string) => v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

/** The verification window: the uploaded file on the left; the staff member's own submitted details and the
 * reviewer's controls on the right. Approving records the reviewer's findings and signs with their signature;
 * requesting a re-upload sends the same text to the staff member as the reason. */
export function VerificationModal({ item, initialAction, signatureId, onClose, onSaved }: { item: ReviewQueueEntry; initialAction: ReviewAction; signatureId: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [file, setFile] = useState<{ url: string; fileType: string } | null>(null)
  const [fileState, setFileState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [action, setAction] = useState<ReviewAction>(initialAction)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api.get<{ url: string; fileType: string }>(`/documents/${item.id}/file-url`)
      .then(d => { if (!cancelled) { setFile(d); setFileState('ready') } })
      .catch(() => { if (!cancelled) setFileState('error') })
    return () => { cancelled = true }
  }, [item.id])

  useEffect(() => {
    // Focus the window itself, not the notes box: focusing a textarea scrolls it into view and, on a phone, raises the keyboard.
    dialogRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const reject = action === 'reject'
  const save = async () => {
    setError('')
    if (reject && !notes.trim()) { setError('Tell the staff member why a re-upload is needed.'); return }
    if (!reject && !signatureId) { setError('Set up your digital signature in Profile before approving.'); return }
    setSaving(true)
    try {
      await api.patch(`/documents/${item.id}/review`, reject ? { action: 'reject', reason: notes.trim() } : { action: 'approve', signatureId, notes: notes.trim() || undefined })
      onSaved(item.id)
    } catch (err) {
      setError(apiMessage(err, reject ? 'Could not request a re-upload. Please try again.' : 'Could not save the verification. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const label = documentLabel(item)
  const isPdf = file?.fileType === 'application/pdf'
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => { if (!saving) onClose() }}
    >
      <motion.div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="verify-title"
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 1120, maxHeight: '94vh', overflowY: 'auto', padding: 'clamp(16px, 2vw, 28px)', boxShadow: '0 24px 48px rgba(0,0,0,0.25)', fontFamily: 'Poppins,sans-serif', outline: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 16, borderBottom: '1px solid #eef1f5' }}>
          <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 10, background: '#e0f3e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={22} color="#004627" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="verify-title" style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>{label} ({documentRef(item.id)})</h2>
            <div style={{ fontSize: 13, color: '#55667e', marginTop: 3 }}>Submitted by: {item.employee.fullName} ({item.employee.department})</div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close" style={{ width: 44, height: 44, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#5f6b7d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={22} /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] gap-6" style={{ marginTop: 20 }}>
          <div style={{ border: '1px solid #e2e6ec', borderRadius: 12, background: '#f8fafc', minHeight: 'clamp(300px, 46vh, 560px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
            {fileState === 'loading' && <div role="status" style={{ fontSize: 13, color: '#5f6b7d' }}>Loading the document…</div>}
            {fileState === 'error' && <div role="alert" style={{ fontSize: 13, color: '#9b1c1c', textAlign: 'center', padding: 24 }}>The file couldn&apos;t be loaded. The results below were entered by the staff member; you can still record your decision.</div>}
            {fileState === 'ready' && file && (isPdf
              // eslint-disable-next-line @next/next/no-img-element
              ? <iframe src={file.url} title={`${label} — uploaded file`} style={{ border: 'none', width: '100%', height: 'clamp(300px, 46vh, 560px)' }} />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={file.url} alt={`${label} — uploaded file`} style={{ maxWidth: '100%', maxHeight: 'clamp(300px, 46vh, 560px)', objectFit: 'contain' }} />)}
            {fileState === 'ready' && file && (
              <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e6ec', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#064e3b', textDecoration: 'none' }}>
                <ExternalLink size={14} aria-hidden="true" /> Open in new tab
              </a>
            )}
          </div>

          <div style={{ border: '1px solid #e2e6ec', borderRadius: 12, padding: 'clamp(16px, 1.6vw, 22px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.03em', textTransform: 'uppercase' }}>Verification Controls</div>
            <div style={{ height: 1, background: '#eef1f5', margin: '12px 0 8px' }} />

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#5f6b7d', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 2 }}>Submitted by the staff member</div>
              {item.cxrResult !== 'NOT_APPLICABLE' && <DetailRow label="Chest X-Ray" value={pretty(item.cxrResult)} danger={item.cxrResult === 'INFILTRATE'} />}
              {item.genexpertResult !== 'NOT_APPLICABLE' && <DetailRow label="GeneXpert" value={pretty(item.genexpertResult)} danger={item.genexpertResult === 'DETECTED'} />}
              {item.titerResult !== 'NOT_APPLICABLE' && <DetailRow label="Hep B Titer" value={pretty(item.titerResult)} danger={item.titerResult === 'NON_REACTIVE'} />}
              <DetailRow label="Exam date" value={item.examDate ?? '—'} />
              {item.facilityName && <DetailRow label="Facility" value={item.facilityName} />}
              {item.notes && <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', marginTop: 6, fontSize: 13, fontStyle: 'italic', color: '#374151' }}>&ldquo;{item.notes}&rdquo;</div>}
            </div>

            <label htmlFor="verify-notes" style={fieldLabel}>{reject ? 'Reason for re-upload (shown to the staff member) *' : 'Radiology / Lab Finding Notes'}</label>
            <textarea id="verify-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4} className={focusRing}
              placeholder={reject ? 'e.g. The scan is blurry — please upload a clearer copy.' : 'Enter findings (e.g. No active infiltrates observed in bilateral lung fields. Sputum GeneXpert MTB negative.)'}
              style={{ ...inputBase, padding: '12px 14px', resize: 'vertical', minHeight: 100 }}
            />

            <label htmlFor="verify-action" style={{ ...fieldLabel, marginTop: 16 }}>Update Clearance Action</label>
            <div style={{ position: 'relative' }}>
              <select id="verify-action" value={action} onChange={e => { setAction(e.target.value as ReviewAction); setError('') }} className={focusRing}
                style={{ ...inputBase, height: 44, padding: '0 44px 0 14px', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="approve">Approved and Mark Up to Date</option>
                <option value="reject">Request Re-upload</option>
              </select>
              <ChevronDown size={18} color="#333" aria-hidden="true" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>

            {!reject && !signatureId && <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: '14px 0 0' }}>*Set up your digital signature in Profile before approving.</p>}
            {error && <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#b42318', margin: '14px 0 0' }}>{error}</p>}

            <div style={{ marginTop: 'auto', paddingTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={save} disabled={saving || (!reject && !signatureId)}
                style={{ minHeight: 46, padding: '10px 16px', border: 'none', borderRadius: 8, background: reject ? '#9f1239' : GREEN, color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: saving || (!reject && !signatureId) ? 'default' : 'pointer', opacity: saving || (!reject && !signatureId) ? 0.65 : 1, lineHeight: 1.3 }}
              >
                {saving ? 'Saving…' : reject ? 'Send Re-upload Request' : 'Save Verification & Update Staff Registry'}
              </button>
              <button onClick={onClose} disabled={saving} style={{ minHeight: 44, border: '1px solid #e2e6ec', borderRadius: 8, background: '#f7f9fc', color: '#374151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
