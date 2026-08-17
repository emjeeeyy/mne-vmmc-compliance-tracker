'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CloudUpload, FileText, Clock, Camera, File, X, ChevronRight } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getRole } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'

/** Backend shape from POST /documents and GET /me/documents. */
interface DocumentEntry {
  id: string
  docType: string
  cxrResult: 'CLEARED' | 'INFILTRATE' | 'PENDING' | 'NOT_APPLICABLE'
  genexpertResult: 'NOT_DETECTED' | 'DETECTED' | 'PENDING' | 'NOT_APPLICABLE'
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
 * derive a human label from which result(s) the submission carries. */
function resultLabel(cxrResult: DocumentEntry['cxrResult'], genexpertResult: DocumentEntry['genexpertResult']) {
  const hasCxr = cxrResult !== 'NOT_APPLICABLE'
  const hasGenexpert = genexpertResult !== 'NOT_APPLICABLE'
  if (hasCxr && hasGenexpert) return 'Chest X-Ray & GeneXpert Result'
  if (hasCxr) return 'Chest X-Ray Result'
  if (hasGenexpert) return 'GeneXpert Result'
  return 'Laboratory Report'
}

function labelFor(doc: DocumentEntry) {
  return resultLabel(doc.cxrResult, doc.genexpertResult)
}

const reviewBadgeStyles: Record<DocumentEntry['reviewStatus'], { bg: string; color: string; border: string; label: string }> = {
  PENDING: { bg: '#fffaf0', color: '#dd8b3a', border: '#feebc8', label: 'PENDING' },
  APPROVED: { bg: '#f0fff4', color: '#38a169', border: '#c6f6d5', label: 'VERIFIED' },
  REJECTED: { bg: '#fff5f5', color: '#e53e3e', border: '#feb2b2', label: 'REJECTED' },
}

function shortDate(dateStr: string) {
  const [monthDay] = dateStr.split(',')
  return monthDay.toUpperCase()
}

/** Admin's "Review Queue" — items awaiting verification, submitted by staff
 * through the flow above. Separate dataset from `submissions` (staff's own
 * uploads) since this represents a different vantage point (admin reviewing
 * everyone else's pending results, not a personal upload history). */
interface ReviewQueueEntry {
  id: string
  docType: string
  cxrResult: DocumentEntry['cxrResult']
  genexpertResult: DocumentEntry['genexpertResult']
  examDate: string | null
  uploadedAt: string
  employee: {
    id: string
    employeeId: string
    fullName: string
    jobTitle: string | null
    department: string
  }
}

function initialsOf(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

const resultToggleButton = (active: boolean) => ({
  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontFamily: 'Public Sans,sans-serif', fontSize: 11, fontWeight: 700,
  background: active ? '#1f3151' : '#f8fafc', color: active ? '#fff' : '#a0aec0',
  transition: 'all 0.15s',
})

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
  const [rejectReason, setRejectReason] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [signatureId, setSignatureId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadKey, setUploadKey] = useState('')
  const [examDate, setExamDate] = useState('')
  const [cxrResult, setCxrResult] = useState<'' | 'CLEARED' | 'INFILTRATE'>('')
  const [genexpertResult, setGenexpertResult] = useState<'' | 'NOT_DETECTED' | 'DETECTED'>('')
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
    return () => { cancelled = true }
  }, [role])

  const openMetadataModal = (file: File) => {
    const error = validateFileClientSide(file)
    if (error) { setFormError(error); return }
    setFormError('')
    setPendingFile(file)
    setUploadKey(crypto.randomUUID())
    setExamDate('')
    setCxrResult('')
    setGenexpertResult('')
  }

  const closeMetadataModal = () => {
    if (submitting) return
    setPendingFile(null)
    setFormError('')
  }

  const handleConfirmUpload = async () => {
    if (!pendingFile) return
    if (!examDate) { setFormError('Please enter the exam date.'); return }
    if (!cxrResult && !genexpertResult) { setFormError('Provide at least one result (Chest X-Ray or GeneXpert).'); return }

    setFormError('')
    setSubmitting(true)
    setRetrying(false)
    try {
      const formData = new FormData()
      formData.append('file', pendingFile)
      formData.append('examDate', examDate)
      if (cxrResult) formData.append('cxrResult', cxrResult)
      if (genexpertResult) formData.append('genexpertResult', genexpertResult)

      const doc = await api.post<DocumentEntry>('/documents', formData, {
        idempotencyKey: uploadKey,
        onRetry: () => setRetrying(true),
      })
      setDocuments(prev => [doc, ...prev])
      setPendingFile(null)
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Upload failed. Please try again.'))
    } finally {
      setSubmitting(false)
      setRetrying(false)
    }
  }

  const closeQueueModal = () => {
    if (reviewSubmitting) return
    setSelectedQueueItem(null)
    setRejectReason('')
    setReviewError('')
  }

  const handleApprove = async () => {
    if (!selectedQueueItem) return
    if (!signatureId) {
      setReviewError('Set up your digital signature in Profile before approving.')
      return
    }
    setReviewSubmitting(true)
    setReviewError('')
    try {
      await api.patch(`/documents/${selectedQueueItem.id}/review`, { action: 'approve', signatureId })
      setReviewQueue(prev => prev.filter(q => q.id !== selectedQueueItem.id))
      setSelectedQueueItem(null)
      setRejectReason('')
    } catch (err) {
      setReviewError(apiErrorMessage(err, 'Could not approve. Please try again.'))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!selectedQueueItem) return
    if (!rejectReason.trim()) {
      setReviewError('Please provide a rejection reason.')
      return
    }
    setReviewSubmitting(true)
    setReviewError('')
    try {
      await api.patch(`/documents/${selectedQueueItem.id}/review`, { action: 'reject', reason: rejectReason.trim() })
      setReviewQueue(prev => prev.filter(q => q.id !== selectedQueueItem.id))
      setSelectedQueueItem(null)
      setRejectReason('')
    } catch (err) {
      setReviewError(apiErrorMessage(err, 'Could not reject. Please try again.'))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const pendingQueue = reviewQueue

  const metadataModal = (
    <AnimatePresence>
      {pendingFile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={closeMetadataModal}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 380, padding: 22, boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151', letterSpacing: '0.02em' }}>Result Details</span>
              <button onClick={closeMetadataModal} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 20 }}>
              <FileText size={18} color="#008d46" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#1f3151', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Exam Date</label>
              <input
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Chest X-Ray Result</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={resultToggleButton(cxrResult === '')} onClick={() => setCxrResult('')}>N/A</button>
                <button style={resultToggleButton(cxrResult === 'CLEARED')} onClick={() => setCxrResult('CLEARED')}>Cleared</button>
                <button style={resultToggleButton(cxrResult === 'INFILTRATE')} onClick={() => setCxrResult('INFILTRATE')}>Infiltrate</button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>GeneXpert Result</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={resultToggleButton(genexpertResult === '')} onClick={() => setGenexpertResult('')}>N/A</button>
                <button style={resultToggleButton(genexpertResult === 'NOT_DETECTED')} onClick={() => setGenexpertResult('NOT_DETECTED')}>Not Detected</button>
                <button style={resultToggleButton(genexpertResult === 'DETECTED')} onClick={() => setGenexpertResult('DETECTED')}>Detected</button>
              </div>
            </div>

            {formError && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 16 }}>
                {formError}
              </motion.p>
            )}

            <motion.button
              onClick={handleConfirmUpload}
              disabled={submitting}
              whileHover={submitting ? undefined : { scale: 1.02, filter: 'brightness(1.05)' }}
              whileTap={submitting ? undefined : { scale: 0.98 }}
              style={{ width: '100%', padding: '14px 0', background: '#008d46', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.75 : 1 }}
            >
              {submitting ? (retrying ? 'Retrying…' : 'Saving…') : 'Submit'}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div>
      {/* Mobile-native results (phones, < sm) */}
      <div className="sm:hidden">
        {role === 'admin' ? (
          <>
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Review Queue</h1>
                <div style={{ fontSize: 11, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Awaiting Verification</div>
              </div>
              <span style={{ background: '#fffaf0', color: '#dd8b3a', borderRadius: 999, padding: '6px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {pendingQueue.length} Pending
              </span>
            </motion.div>

            {queueLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>Loading…</div>}
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
                  onClick={() => setSelectedQueueItem(item)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12, border: 'none', cursor: 'pointer', overflow: 'hidden' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fffaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color="#dd8b3a" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{item.employee.fullName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ background: '#fffaf0', color: '#dd8b3a', borderRadius: 999, padding: '2px 8px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{resultLabel(item.cxrResult, item.genexpertResult)}</span>
                      <span style={{ fontSize: 10, color: '#a0aec0' }}>{formatUploadedAt(item.uploadedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#cbd5e0" style={{ flexShrink: 0 }} />
                </motion.button>
              ))}
            </AnimatePresence>
            {!queueLoading && pendingQueue.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>No pending items.</div>
            )}
          </>
        ) : (
          <>
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', margin: 0 }}>Medical Documents</h1>
          <div style={{ fontSize: 11, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Upload &amp; Records</div>
        </motion.div>

        <motion.div
          custom={1}
          variants={fadeRise}
          initial="hidden"
          animate="visible"
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) openMetadataModal(f) }}
          style={{
            border: `1.5px dashed ${dragging ? '#008d46' : '#cbd5e0'}`,
            borderRadius: 20,
            padding: '36px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: dragging ? '#f0faf4' : '#fff',
            marginBottom: 20,
          }}
        >
          <CloudUpload size={44} color="#a0aec0" strokeWidth={1.5} style={{ marginBottom: 16 }} />
          <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', marginBottom: 8 }}>Upload New Result</div>
          <p style={{ fontSize: 12, color: '#a0aec0', textAlign: 'center', lineHeight: 1.6, maxWidth: 240, margin: 0, marginBottom: 8 }}>
            Tap to take a photo of your result or select a file.
          </p>
          <p style={{ fontSize: 11, color: '#cbd5e0', textAlign: 'center', margin: 0, marginBottom: 20 }}>
            PDF, PNG, JPEG • Max 5MB
          </p>
          <button
            onClick={() => setShowUploadSheet(true)}
            style={{ background: '#008d46', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 32px', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            Browse Files
          </button>
          <input ref={mobileInputRef} type="file" accept=".pdf,.png,.jpeg,.jpg" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { openMetadataModal(f); setShowUploadSheet(false) } }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { openMetadataModal(f); setShowUploadSheet(false) } }} />
        </motion.div>

        {formError && !pendingFile && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginTop: -12, marginBottom: 16 }}>
            {formError}
          </motion.p>
        )}

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
                  <button onClick={() => setShowUploadSheet(false)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#a0aec0', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
                  Capture or select a document to upload to your medical documents.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 16, padding: '22px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <Camera size={26} color="#1f3151" strokeWidth={1.5} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1f3151', letterSpacing: '0.03em' }}>CAMERA</span>
                  </button>
                  <button
                    onClick={() => mobileInputRef.current?.click()}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 16, padding: '22px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <File size={26} color="#1f3151" strokeWidth={1.5} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1f3151', letterSpacing: '0.03em' }}>FILES</span>
                  </button>
                </div>
                <button
                  onClick={() => setShowUploadSheet(false)}
                  style={{ width: '100%', padding: 14, background: '#e2e8f0', color: '#1f3151', border: 'none', borderRadius: 14, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ fontSize: 11, color: '#a0aec0', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>Recent Submissions</div>
        {docsLoading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#a0aec0', fontSize: 13 }}>Loading…</div>}
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
                <div style={{ fontSize: 11, color: '#a0aec0' }}>SUBMITTED: {shortDate(formatUploadedAt(doc.uploadedAt))}</div>
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
          <>
            <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
              <div>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Review Queue</h1>
                <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Verify staff-submitted diagnostic results before they&apos;re added to the hospital compliance registry.</p>
              </div>
              <span style={{ background: '#fffaf0', color: '#dd8b3a', borderRadius: 999, padding: '10px 18px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {pendingQueue.length} Pending
              </span>
            </motion.div>

            <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 24 }}>REVIEW QUEUE</div>
              {queueLoading && <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0aec0', fontSize: 14 }}>Loading…</div>}
              {queueError && <div style={{ textAlign: 'center', padding: '20px 0', color: '#c53030', fontSize: 13, fontWeight: 700 }}>{queueError}</div>}
              <AnimatePresence initial={false}>
                {!queueLoading && pendingQueue.map(item => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => setSelectedQueueItem(item)}
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, background: '#f8fafc', overflow: 'hidden', cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none', marginBottom: 12 }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fffaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={22} color="#dd8b3a" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase', marginBottom: 4 }}>{item.employee.fullName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ background: '#fffaf0', color: '#dd8b3a', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{resultLabel(item.cxrResult, item.genexpertResult)}</span>
                        <span style={{ fontSize: 12, color: '#a0aec0' }}>{item.employee.employeeId} • {formatUploadedAt(item.uploadedAt)}</span>
                      </div>
                    </div>
                    <ChevronRight size={20} color="#cbd5e0" style={{ flexShrink: 0 }} />
                  </motion.button>
                ))}
              </AnimatePresence>
              {!queueLoading && pendingQueue.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0aec0', fontSize: 14 }}>No pending items.</div>
              )}
            </motion.div>
          </>
        ) : (
          <>
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Upload Pulmonary Laboratory Reports</h1>
          <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Submit chest diagnostic films or GeneXpert assays. Documents will be cryptographically logged and evaluated immediately.</p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6" style={{ alignItems: 'flex-start' }}>
          {/* Dropzone */}
          <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="w-full lg:flex-[0_0_60%]">
            <motion.div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) openMetadataModal(f) }}
              onClick={() => inputRef.current?.click()}
              animate={dragging ? { scale: 1.01 } : { scale: 1 }}
              transition={{ duration: 0.2 }}
              className="px-6 py-12 sm:px-10 sm:py-16"
              style={{
                border: `1.5px dashed ${dragging ? '#008d46' : '#a0aec0'}`,
                borderRadius: 24,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.2s, background 0.2s',
                background: dragging ? '#f0faf4' : '#fff',
                gap: 20,
              }}
            >
              <motion.div animate={dragging ? { y: [-2, 2, -2], transition: { repeat: Infinity, duration: 0.8 } } : { y: 0 }}>
                <CloudUpload size={64} color="#1f3151" strokeWidth={1.5} style={{ transition: 'color 0.2s' }} />
              </motion.div>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 800, color: '#1f3151' }}>Upload New Medical Result</div>
              <p style={{ fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 1.6, maxWidth: 320, margin: 0 }}>
                Drag and drop your certified report here, or click to browse files from your local storage.
              </p>
              <motion.button
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                whileHover={{ filter: 'brightness(1.1)', y: -1 }}
                whileTap={{ scale: 0.97 }}
                style={{ background: '#008d46', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 28px', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8 }}
              >
                BROWSE FILE
              </motion.button>
              <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 12 }}>Accepted filetypes: PDF, PNG, JPEG • Max limit: 5MB</div>
            </motion.div>
            <input ref={inputRef} type="file" accept=".pdf,.png,.jpeg,.jpg" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) openMetadataModal(f) }} />
            {formError && !pendingFile && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginTop: 12, textAlign: 'center' }}>
                {formError}
              </motion.p>
            )}
          </motion.div>

          {/* Recent submissions */}
          <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" className="w-full lg:flex-1" style={{ background: '#fff', borderRadius: 24, padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 24 }}>RECENT SUBMISSIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              {docsLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>Loading…</div>}
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
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', border: '1px solid #e2e8f0', borderRadius: 16, background: '#f8fafc', overflow: 'hidden' }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f0fff4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={20} color="#38a169" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(doc)}</div>
                        <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 2 }}>{formatFileSize(doc.fileSizeBytes)}</div>
                        <div style={{ fontSize: 11, color: '#a0aec0' }}>{formatUploadedAt(doc.uploadedAt)}</div>
                      </div>
                      <motion.span
                        initial={i === 0 ? { scale: 0.7, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.25, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, borderRadius: 999, padding: '4px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {badge.label}
                      </motion.span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {!docsLoading && documents.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>No submissions yet.</div>
              )}
            </div>
            <div style={{ marginTop: 32, textAlign: 'center', padding: '0 24px' }}>
              <p style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6, margin: 0 }}>
                Missing a previous cycle report?<br/>Contact the Pulmonary Surveillance<br/>archives to retrieve previous records.
              </p>
            </div>
          </motion.div>
        </div>
          </>
        )}
      </div>

      {metadataModal}

      <AnimatePresence>
        {selectedQueueItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={closeQueueModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 360, padding: 22, boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 800, color: '#1f3151', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Detailed Document Review</span>
                <button onClick={closeQueueModal} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', borderRadius: 14, padding: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 13, color: '#1f3151', flexShrink: 0 }}>
                  {initialsOf(selectedQueueItem.employee.fullName)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedQueueItem.employee.fullName}</div>
                  <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 2 }}>{selectedQueueItem.employee.employeeId} • {selectedQueueItem.employee.department}</div>
                </div>
              </div>

              <div style={{ background: '#f1f5f9', borderRadius: 16, padding: '20px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, textAlign: 'center' }}>{resultLabel(selectedQueueItem.cxrResult, selectedQueueItem.genexpertResult)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedQueueItem.cxrResult !== 'NOT_APPLICABLE' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: '#a0aec0', textTransform: 'uppercase' }}>Chest X-Ray</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: selectedQueueItem.cxrResult === 'INFILTRATE' ? '#c53030' : '#2f855a', textTransform: 'uppercase' }}>{selectedQueueItem.cxrResult}</span>
                    </div>
                  )}
                  {selectedQueueItem.genexpertResult !== 'NOT_APPLICABLE' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: '#a0aec0', textTransform: 'uppercase' }}>GeneXpert</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: selectedQueueItem.genexpertResult === 'DETECTED' ? '#c53030' : '#2f855a', textTransform: 'uppercase' }}>{selectedQueueItem.genexpertResult}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#a0aec0', textTransform: 'uppercase' }}>Exam Date</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1f3151', textTransform: 'uppercase' }}>{selectedQueueItem.examDate ?? '—'}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Rejection Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Required only if rejecting…"
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {!signatureId && (
                <p style={{ fontSize: 11, fontWeight: 700, color: '#b7791f', marginBottom: 12 }}>*Set up your digital signature in Profile before approving.</p>
              )}
              {reviewError && (
                <p style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 12 }}>{reviewError}</p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleReject}
                  disabled={reviewSubmitting}
                  style={{ flex: 1, padding: '13px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: reviewSubmitting ? 'default' : 'pointer', opacity: reviewSubmitting ? 0.75 : 1 }}
                >
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={reviewSubmitting || !signatureId}
                  style={{ flex: 1, padding: '13px 0', background: '#008d46', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: reviewSubmitting || !signatureId ? 'default' : 'pointer', opacity: reviewSubmitting || !signatureId ? 0.6 : 1 }}
                >
                  {reviewSubmitting ? 'Saving…' : 'Approve'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
