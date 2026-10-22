'use client'

import { useEffect, useId, useState, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CloudUpload, FileText, FileCheck, Clock, Camera, File, X, ChevronRight, ChevronDown } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getRole } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { ReviewQueueTable, VerificationModal, type ReviewQueueEntry, type ReviewAction } from './DocumentVerification'

/** Backend shape from POST /documents and GET /me/documents. */
interface DocumentEntry {
  id: string
  docType: string
  cxrResult: 'CLEARED' | 'INFILTRATE' | 'PENDING' | 'NOT_APPLICABLE'
  genexpertResult: 'NOT_DETECTED' | 'DETECTED' | 'PENDING' | 'NOT_APPLICABLE'
  titerResult: 'REACTIVE' | 'NON_REACTIVE' | 'NOT_APPLICABLE'
  title: string | null
  facilityName: string | null
  notes: string | null
  examDate: string | null
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  fileType: string
  fileSizeBytes: number
  uploadedAt: string
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpeg', '.jpg']
const MAX_SIZE_BYTES = 5 * 1024 * 1024

function validateFileClientSide(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return 'Only PDF, PNG, or JPEG files are accepted.'
  if (file.size > MAX_SIZE_BYTES) return 'File exceeds the 5MB limit.'
  return null
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow or unavailable. Please try again.'
  return fallback
}

function formatFileSize(bytes: number) {
  const kb = bytes / 1024
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`
}

function formatUploadedAt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

/** Documents have no stored filename (schema captures results, not the original upload name) —
 * derive a human label from the submission's category/result(s). */
function resultLabel(docType: string, cxrResult: DocumentEntry['cxrResult'], genexpertResult: DocumentEntry['genexpertResult']) {
  if (docType === 'HEPB_TITER') return 'Hepatitis B Titer'
  const hasCxr = cxrResult !== 'NOT_APPLICABLE'
  const hasGenexpert = genexpertResult !== 'NOT_APPLICABLE'
  if (hasCxr && hasGenexpert) return 'Chest X-Ray & GeneXpert Result'
  if (hasCxr) return 'Chest X-Ray Result'
  if (hasGenexpert) return 'GeneXpert Result'
  return 'Laboratory Report'
}

function labelFor(doc: DocumentEntry) {
  return doc.title?.trim() || resultLabel(doc.docType, doc.cxrResult, doc.genexpertResult)
}

// Text colors darkened from #dd8b3a/#38a169/#e53e3e, which failed WCAG AA contrast on these fills.
const reviewBadgeStyles: Record<DocumentEntry['reviewStatus'], { bg: string; color: string; border: string; label: string }> = {
  PENDING: { bg: '#fffbe8', color: '#7b381b', border: '#f6e2a3', label: 'Pending' },
  APPROVED: { bg: '#e4fcf3', color: '#006042', border: '#a8ead0', label: 'Verified' },
  REJECTED: { bg: '#fff5f5', color: '#b42318', border: '#feb2b2', label: 'Rejected' },
}

/** CSS `dashed` can't set dash length; the mockup's dropzone uses long dashes, so draw them with SVG. */
function dashedBorder(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='100%' fill='none' rx='18' ry='18' stroke='${color}' stroke-width='3' stroke-dasharray='9 7'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function shortDate(dateStr: string) {
  const [monthDay] = dateStr.split(',')
  return monthDay.toUpperCase()
}

// Field styling measured from the Submit Health Documents mockup (1440 frame): 41px inputs, 12px
// radius, #ebebeb border, Poppins 14px Title Case labels. Placeholder/helper grays are darkened from
// the mockup's #c6c6c6 to #767676 so they meet WCAG AA contrast.
const formLabelStyle = { display: 'block' as const, fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 500, color: '#454545', marginBottom: 8 }
const formInputStyle = { width: '100%', height: 41, padding: '0 18px', border: '1px solid #ebebeb', borderRadius: 12, background: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 14, color: '#454545', boxSizing: 'border-box' as const }
const formInputClass = 'outline-none placeholder:text-[#767676] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006042]'

/** Native <select> in the mockup's input styling, with the mockup's chevron drawn on top. */
function FormSelect({ id, value, onChange, placeholder, children }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; children: ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={formInputClass}
        style={{ ...formInputStyle, appearance: 'none', paddingRight: 46, cursor: 'pointer', color: value ? '#454545' : '#767676' }}
      >
        {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
        {children}
      </select>
      <ChevronDown size={18} color="#333" aria-hidden="true" style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </div>
  )
}

interface UploadFormFieldsProps {
  category: '' | 'APE' | 'HEPB_TITER'
  setCategory: (v: 'APE' | 'HEPB_TITER') => void
  title: string
  setTitle: (v: string) => void
  facilityName: string
  setFacilityName: (v: string) => void
  examDate: string
  setExamDate: (v: string) => void
  department: { name: string; code: string } | null
  dropzone: ReactNode
  cxrResult: '' | 'CLEARED' | 'INFILTRATE'
  setCxrResult: (v: '' | 'CLEARED' | 'INFILTRATE') => void
  genexpertResult: '' | 'NOT_DETECTED' | 'DETECTED'
  setGenexpertResult: (v: '' | 'NOT_DETECTED' | 'DETECTED') => void
  titerResult: '' | 'REACTIVE' | 'NON_REACTIVE'
  setTiterResult: (v: 'REACTIVE' | 'NON_REACTIVE') => void
  notes: string
  setNotes: (v: string) => void
  formError: string
  submitting: boolean
  retrying: boolean
  onSubmit: () => void
}

/** The full "Submit Health Documents" form, shared verbatim between the mobile and desktop
 * trees — only the dropzone (passed in as a slot) differs by breakpoint, since mobile's file
 * picker opens a camera-vs-files sheet while desktop clicks straight into a file browser. */
function UploadFormFields(p: UploadFormFieldsProps) {
  const id = useId()
  return (
    <div style={{ fontFamily: 'Poppins,sans-serif' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-[22px]">
        <div>
          <label htmlFor={`${id}-category`} style={formLabelStyle}>Select Health Screening Category *</label>
          <FormSelect id={`${id}-category`} value={p.category} onChange={v => p.setCategory(v as 'APE' | 'HEPB_TITER')} placeholder="Select a category">
            <option value="APE">1. Annual Physical Exam (APE)</option>
            <option value="HEPB_TITER">2. Hepatitis B Titer</option>
          </FormSelect>
        </div>
        <div>
          {/* The mockup labels this field "Select Health Screening Category" a second time, a Figma
              copy-paste slip (its placeholder is a document title), so it's built as Document Title. */}
          <label htmlFor={`${id}-title`} style={formLabelStyle}>Document Title</label>
          <input id={`${id}-title`} value={p.title} onChange={e => p.setTitle(e.target.value)} placeholder="e.g. Chest Radiograph Report 2026" className={formInputClass} style={formInputStyle} />
        </div>
        <div>
          <label htmlFor={`${id}-facility`} style={formLabelStyle}>Clinic / Diagnostic Facility Name</label>
          <input id={`${id}-facility`} value={p.facilityName} onChange={e => p.setFacilityName(e.target.value)} placeholder="e.g. Nurse Maria Santos" className={formInputClass} style={formInputStyle} />
        </div>
        <div>
          <label htmlFor={`${id}-date`} style={formLabelStyle}>Date Exam Conducted *</label>
          <input id={`${id}-date`} type="date" value={p.examDate} onChange={e => p.setExamDate(e.target.value)} className={formInputClass} style={{ ...formInputStyle, color: p.examDate ? '#454545' : '#767676' }} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-dept`} style={formLabelStyle}>Department *</label>
          <input id={`${id}-dept`} readOnly value={p.department ? `${p.department.name} (${p.department.code})` : '—'} className={formInputClass} style={{ ...formInputStyle, background: '#f8fafc', cursor: 'default' }} />
        </div>
      </div>

      <div style={{ marginTop: 22 }}>{p.dropzone}</div>

      {p.category === 'HEPB_TITER' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7" style={{ marginTop: 22 }}>
          <div>
            <label htmlFor={`${id}-titer`} style={formLabelStyle}>Hep B Titer Result *</label>
            <FormSelect id={`${id}-titer`} value={p.titerResult} onChange={v => p.setTiterResult(v as 'REACTIVE' | 'NON_REACTIVE')} placeholder="Select result">
              <option value="REACTIVE">Reactive</option>
              <option value="NON_REACTIVE">Non-Reactive</option>
            </FormSelect>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-[22px]" style={{ marginTop: 22 }}>
          <div>
            <label htmlFor={`${id}-cxr`} style={formLabelStyle}>Chest X-Ray Result</label>
            <FormSelect id={`${id}-cxr`} value={p.cxrResult} onChange={v => p.setCxrResult(v as '' | 'CLEARED' | 'INFILTRATE')}>
              <option value="">N/A</option>
              <option value="CLEARED">Cleared</option>
              <option value="INFILTRATE">Infiltrate</option>
            </FormSelect>
          </div>
          <div>
            <label htmlFor={`${id}-genexpert`} style={formLabelStyle}>GeneXpert Result</label>
            <FormSelect id={`${id}-genexpert`} value={p.genexpertResult} onChange={v => p.setGenexpertResult(v as '' | 'NOT_DETECTED' | 'DETECTED')}>
              <option value="">N/A</option>
              <option value="NOT_DETECTED">Not Detected</option>
              <option value="DETECTED">Detected</option>
            </FormSelect>
          </div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <label htmlFor={`${id}-notes`} style={formLabelStyle}>Additional Notes for TB DOTS Reviewer</label>
        <textarea
          id={`${id}-notes`}
          value={p.notes}
          onChange={e => p.setNotes(e.target.value)}
          placeholder="e.g. Chest radiograph shows clear lung fields. No active parenchymal lesion."
          className={formInputClass}
          style={{ ...formInputStyle, height: 100, padding: '12px 14px', resize: 'none', display: 'block' }}
        />
      </div>

      {p.formError && (
        <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 13, fontWeight: 600, color: '#c53030', margin: '16px 0 0' }}>
          {p.formError}
        </motion.p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
        <motion.button
          onClick={p.onSubmit}
          disabled={p.submitting}
          whileHover={p.submitting ? undefined : { filter: 'brightness(1.15)' }}
          whileTap={p.submitting ? undefined : { scale: 0.98 }}
          style={{ height: 40, padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#006042', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 600, cursor: p.submitting ? 'default' : 'pointer', opacity: p.submitting ? 0.75 : 1, whiteSpace: 'nowrap' }}
        >
          {p.submitting ? (p.retrying ? 'Retrying…' : 'Saving…') : 'Save Clearance Record'}
        </motion.button>
      </div>
    </div>
  )
}

export default function Upload() {
  const [dragging, setDragging] = useState(false)
  const [documents, setDocuments] = useState<DocumentEntry[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [showUploadSheet, setShowUploadSheet] = useState(false)
  const [role, setRole] = useState<'staff' | 'admin'>('staff')
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueEntry[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState('')
  const [selectedQueueItem, setSelectedQueueItem] = useState<ReviewQueueEntry | null>(null)
  const [initialAction, setInitialAction] = useState<ReviewAction>('approve')
  const [signatureId, setSignatureId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadKey, setUploadKey] = useState('')
  const [category, setCategory] = useState<'' | 'APE' | 'HEPB_TITER'>('')
  const [title, setTitle] = useState('')
  const [facilityName, setFacilityName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [cxrResult, setCxrResult] = useState<'' | 'CLEARED' | 'INFILTRATE'>('')
  const [genexpertResult, setGenexpertResult] = useState<'' | 'NOT_DETECTED' | 'DETECTED'>('')
  const [titerResult, setTiterResult] = useState<'' | 'REACTIVE' | 'NON_REACTIVE'>('')
  const [notes, setNotes] = useState('')
  const [department, setDepartment] = useState<{ name: string; code: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    setRole(getRole())
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    let cancelled = false
    setQueueLoading(true)
    setQueueError('')
    api
      .get<ReviewQueueEntry[]>('/review-queue')
      .then((data) => { if (!cancelled) setReviewQueue(data) })
      .catch((err) => { if (!cancelled) setQueueError(apiErrorMessage(err, 'Could not load the review queue.')) })
      .finally(() => { if (!cancelled) setQueueLoading(false) })
    api
      .get<{ id: string; imageUrl: string | null } | null>('/me/signature')
      .then((data) => { if (!cancelled) setSignatureId(data?.id ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [role])

  useEffect(() => {
    if (role !== 'staff') return
    let cancelled = false
    setDocsLoading(true)
    api
      .get<DocumentEntry[]>('/me/documents')
      .then((data) => { if (!cancelled) setDocuments(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDocsLoading(false) })
    // Reuses the same overview endpoint Dashboard.tsx already depends on, just for the
    // employee's own department name/code — a read-only display on this form, not an
    // editable field, so a second dedicated endpoint isn't worth adding.
    api
      .get<{ department: { name: string; code: string } }>('/dashboard/overview')
      .then((data) => { if (!cancelled) setDepartment(data.department) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [role])

  // File selection just attaches the file to the already-visible form — there's no longer a
  // separate modal step. Category/results/etc. are left alone (the user may have already
  // started filling the form before picking a file), only the per-upload idempotency key
  // and any stale file-level error are reset.
  const selectFile = (file: File) => {
    const error = validateFileClientSide(file)
    if (error) { setFormError(error); return }
    setFormError('')
    setPendingFile(file)
    setUploadKey(crypto.randomUUID())
  }

  const resetForm = () => {
    setPendingFile(null)
    setCategory('')
    setTitle('')
    setFacilityName('')
    setExamDate('')
    setCxrResult('')
    setGenexpertResult('')
    setTiterResult('')
    setNotes('')
  }

  const handleSaveClearanceRecord = async () => {
    if (!pendingFile) { setFormError('Please attach a file.'); return }
    if (!category) { setFormError('Please select a screening category.'); return }
    if (!examDate) { setFormError('Please enter the exam date.'); return }
    if (category === 'HEPB_TITER') {
      if (!titerResult) { setFormError('Provide the titer result (Reactive or Non-Reactive).'); return }
    } else if (!cxrResult && !genexpertResult) {
      setFormError('Provide at least one result (Chest X-Ray or GeneXpert).'); return
    }

    setFormError('')
    setSubmitting(true)
    setRetrying(false)
    try {
      const formData = new FormData()
      formData.append('file', pendingFile)
      formData.append('category', category)
      formData.append('examDate', examDate)
      if (title.trim()) formData.append('title', title.trim())
      if (facilityName.trim()) formData.append('facilityName', facilityName.trim())
      if (notes.trim()) formData.append('notes', notes.trim())
      if (category === 'HEPB_TITER') {
        formData.append('titerResult', titerResult)
      } else {
        if (cxrResult) formData.append('cxrResult', cxrResult)
        if (genexpertResult) formData.append('genexpertResult', genexpertResult)
      }

      const doc = await api.post<DocumentEntry>('/documents', formData, {
        idempotencyKey: uploadKey,
        onRetry: () => setRetrying(true),
      })
      setDocuments(prev => [doc, ...prev])
      resetForm()
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Upload failed. Please try again.'))
    } finally {
      setSubmitting(false)
      setRetrying(false)
    }
  }

  const openVerification = (item: ReviewQueueEntry, action: ReviewAction) => {
    setInitialAction(action)
    setSelectedQueueItem(item)
  }

  const pendingQueue = reviewQueue

  return (
    <div>
      {/* Mobile-native results (phones, < sm) */}
      <div className="sm:hidden">
        {role === 'admin' ? (
          <>
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Review Queue</h1>
                <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Awaiting Verification</div>
              </div>
              <span style={{ background: '#fffaf0', color: '#7b381b', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {pendingQueue.length} Pending
              </span>
            </motion.div>

            {queueLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#5f6b7d', fontSize: 13 }}>Loading…</div>}
            {queueError && <div style={{ textAlign: 'center', padding: '20px 0', color: '#c53030', fontSize: 12, fontWeight: 700 }}>{queueError}</div>}
            <AnimatePresence initial={false}>
              {!queueLoading && pendingQueue.map((item, i) => (
                <motion.button
                  key={item.id}
                  custom={i + 1}
                  variants={fadeRise}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => openVerification(item, 'approve')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12, border: 'none', cursor: 'pointer', overflow: 'hidden' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fffaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color="#dd8b3a" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{item.employee.fullName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ background: '#fffaf0', color: '#7b381b', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>{item.title?.trim() || resultLabel(item.docType, item.cxrResult, item.genexpertResult)}</span>
                      <span style={{ fontSize: 12, color: '#5f6b7d' }}>{formatUploadedAt(item.uploadedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#cbd5e0" style={{ flexShrink: 0 }} />
                </motion.button>
              ))}
            </AnimatePresence>
            {!queueLoading && pendingQueue.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#5f6b7d', fontSize: 13 }}>No pending items.</div>
            )}
          </>
        ) : (
          <>
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Submit Health Screening Documents</h1>
          <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Upload &amp; Records</div>
        </motion.div>

        <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <UploadFormFields
            category={category} setCategory={setCategory}
            title={title} setTitle={setTitle}
            facilityName={facilityName} setFacilityName={setFacilityName}
            examDate={examDate} setExamDate={setExamDate}
            department={department}
            dropzone={
              <div>
                <span style={formLabelStyle}>Upload File</span>
                <button
                  type="button"
                  onClick={() => setShowUploadSheet(true)}
                  aria-label={pendingFile ? `Selected file: ${pendingFile.name}. Choose a different file.` : 'Take a photo or choose a file to upload'}
                  style={{ width: '100%', border: 'none', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'Poppins,sans-serif', backgroundColor: pendingFile ? '#f0faf4' : '#fafcfd', backgroundImage: dashedBorder(pendingFile ? '#008d46' : '#24755c') }}
                >
                  <span style={{ width: 40, height: 40, borderRadius: 10, background: '#e0f3e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CloudUpload size={20} color="#004627" strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {pendingFile ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#414141', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{pendingFile.name}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#767676' }}>Tap to take a photo or select a file · PDF, PNG, JPEG · Max 5MB</span>
                    )}
                  </span>
                </button>
                <input ref={mobileInputRef} type="file" accept=".pdf,.png,.jpeg,.jpg" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { selectFile(f); setShowUploadSheet(false) } }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { selectFile(f); setShowUploadSheet(false) } }} />
              </div>
            }
            cxrResult={cxrResult} setCxrResult={setCxrResult}
            genexpertResult={genexpertResult} setGenexpertResult={setGenexpertResult}
            titerResult={titerResult} setTiterResult={setTiterResult}
            notes={notes} setNotes={setNotes}
            formError={formError}
            submitting={submitting}
            retrying={retrying}
            onSubmit={handleSaveClearanceRecord}
          />
        </motion.div>

        <AnimatePresence>
          {showUploadSheet && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
              onClick={() => setShowUploadSheet(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 320, padding: 22, boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151', letterSpacing: '0.02em' }}>UPLOAD</span>
                  <button onClick={() => setShowUploadSheet(false)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6b7d', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#5f6b7d', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
                  Capture or select a document to upload to your medical documents.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 16, padding: '22px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <Camera size={26} color="#1f3151" strokeWidth={1.5} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', letterSpacing: '0.03em' }}>CAMERA</span>
                  </button>
                  <button
                    onClick={() => mobileInputRef.current?.click()}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 16, padding: '22px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <File size={26} color="#1f3151" strokeWidth={1.5} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1f3151', letterSpacing: '0.03em' }}>FILES</span>
                  </button>
                </div>
                <button
                  onClick={() => setShowUploadSheet(false)}
                  style={{ width: '100%', padding: 14, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', color: '#1f3151', border: 'none', borderRadius: 14, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ fontSize: 12, color: '#5f6b7d', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>Recent Submissions</div>
        {docsLoading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#5f6b7d', fontSize: 13 }}>Loading…</div>}
        <AnimatePresence initial={false}>
          {!docsLoading && documents.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              custom={i + 2}
              variants={fadeRise}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12, overflow: 'hidden' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} color="#e53e3e" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(doc)}</div>
                <div style={{ fontSize: 12, color: '#5f6b7d' }}>SUBMITTED: {shortDate(formatUploadedAt(doc.uploadedAt))}</div>
              </div>
              <Clock size={18} color="#a0aec0" style={{ flexShrink: 0 }} />
            </motion.div>
          ))}
        </AnimatePresence>
          </>
        )}
      </div>

      {/* Tablet / desktop results */}
      <div className="hidden sm:block">
        {role === 'admin' ? (
          <ReviewQueueTable queue={pendingQueue} loading={queueLoading} error={queueError} onOpen={openVerification} />
        ) : (
          <>
        <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12 px-6 lg:px-[4.4vw]" style={{ paddingTop: 'clamp(24px, 2.3vw, 44px)', fontFamily: 'Poppins,sans-serif' }}>
          {/* Mockup: a full-width header card (4.4vw side margins), then the form centered at ~80% of that width. */}
          <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible"
            style={{ background: '#fff', borderRadius: 18, padding: '26px 30px', boxShadow: '0 4px 8px rgba(15,23,42,0.2)' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 16px 0 14px', borderRadius: 999, background: '#bdf9e1', color: '#004d2f', fontSize: 12, fontWeight: 600 }}>
              <FileCheck size={14} strokeWidth={2.4} aria-hidden="true" /> Document Upload Portal
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: '16px 0 0' }}>Submit Health Screening Documents</h1>
            <p style={{ fontSize: 13, color: '#5e6d85', lineHeight: 1.5, margin: '4px 0 0' }}>Upload your diagnostic reports, chest radiographs, or vaccination certificates directly to the VMMC TB DOTS Unit for review and clearance.</p>
          </motion.div>

          <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="mx-auto w-full lg:w-[79.5%]"
            style={{ marginTop: 'clamp(24px, 2.4vw, 40px)', background: '#fff', borderRadius: 18, padding: 30 }}
          >
            <UploadFormFields
              category={category} setCategory={setCategory}
              title={title} setTitle={setTitle}
              facilityName={facilityName} setFacilityName={setFacilityName}
              examDate={examDate} setExamDate={setExamDate}
              department={department}
              dropzone={
                <>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={pendingFile ? `Selected file: ${pendingFile.name}. Press to choose a different file.` : 'Choose a file to upload, or drag and drop it here'}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) selectFile(f) }}
                    onClick={() => inputRef.current?.click()}
                    className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006042]"
                    style={{ minHeight: 228, padding: '44px 20px 48px', borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer', backgroundColor: dragging || pendingFile ? '#f0faf4' : '#fafcfd', backgroundImage: dashedBorder(dragging || pendingFile ? '#008d46' : '#24755c'), transition: 'background-color 0.2s' }}
                  >
                    <span style={{ width: 60, height: 60, borderRadius: 12, background: '#e0f3e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CloudUpload size={30} color="#004627" strokeWidth={2.4} aria-hidden="true" />
                    </span>
                    {pendingFile ? (
                      <>
                        <div style={{ marginTop: 19, fontSize: 14, fontWeight: 600, color: '#414141', wordBreak: 'break-all' }}>{pendingFile.name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: '#767676' }}>{formatFileSize(pendingFile.size)} · Click to choose a different file</div>
                      </>
                    ) : (
                      <>
                        <div style={{ marginTop: 19, fontSize: 14, fontWeight: 600, color: '#414141' }}>Click to Choose File&nbsp; or Drag &amp; Drop</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: '#767676' }}>Supported formats: Medical Scans, Laboratory PDF, Digital Image</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: '#767676' }}>PDF, PNG or JPEG · up to 5MB</div>
                      </>
                    )}
                  </div>
                  <input ref={inputRef} type="file" accept=".pdf,.png,.jpeg,.jpg" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f) }} />
                </>
              }
              cxrResult={cxrResult} setCxrResult={setCxrResult}
              genexpertResult={genexpertResult} setGenexpertResult={setGenexpertResult}
              titerResult={titerResult} setTiterResult={setTiterResult}
              notes={notes} setNotes={setNotes}
              formError={formError}
              submitting={submitting}
              retrying={retrying}
              onSubmit={handleSaveClearanceRecord}
            />
          </motion.div>

          {/* Not in the mockup's visible frame (it's cropped just below the form), but this is the only place
              staff see their uploads' review status, so it sits under the form at the same width. */}
          <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" className="mx-auto w-full lg:w-[79.5%]"
            style={{ marginTop: 24, background: '#fff', borderRadius: 18, padding: 30 }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 18px' }}>Recent Submissions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {docsLoading && <div style={{ textAlign: 'center', padding: '32px 0', color: '#5f6b7d', fontSize: 13 }}>Loading…</div>}
              <AnimatePresence initial={false}>
                {!docsLoading && documents.map((doc, i) => {
                  const badge = reviewBadgeStyles[doc.reviewStatus]
                  return (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, height: 0, y: -10 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', border: '1px solid #ebebeb', borderRadius: 12, background: '#fafcfd', overflow: 'hidden' }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e0f3e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={18} color="#004627" aria-hidden="true" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(doc)}</div>
                        <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2 }}>{formatFileSize(doc.fileSizeBytes)} · {formatUploadedAt(doc.uploadedAt)}</div>
                      </div>
                      <motion.span
                        initial={i === 0 ? { scale: 0.7, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.25, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                      >
                        {badge.label}
                      </motion.span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {!docsLoading && documents.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#5f6b7d', fontSize: 13 }}>No submissions yet.</div>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#5f6b7d', lineHeight: 1.6, margin: '20px 0 0', textAlign: 'center' }}>
              Missing a previous submission? Contact the TB DOTS Unit archives to retrieve previous records.
            </p>
          </motion.div>
        </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedQueueItem && (
          <VerificationModal
            key={selectedQueueItem.id}
            item={selectedQueueItem}
            initialAction={initialAction}
            signatureId={signatureId}
            onClose={() => setSelectedQueueItem(null)}
            onSaved={(id) => { setReviewQueue(prev => prev.filter(q => q.id !== id)); setSelectedQueueItem(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
