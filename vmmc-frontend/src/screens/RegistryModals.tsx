'use client'

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Printer, Search, X } from 'lucide-react'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import {
  cxrText,
  genexpertText,
  isDangerFinding,
  isoDay,
  isPepActive,
  longDate,
  matchesSearch,
  PEP_STATUS_LABEL,
  type ApeRow,
  type ClearanceCertificate,
  type PreEmploymentRow,
  type RegistryPerson,
} from '@/lib/registry'

const GREEN = '#006042'
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow or unavailable. Please try again.'
  return fallback
}

/** Overlay + dialog, portaled to <body> (so a print can show just the sheet — see the .print-portal rules in
 * globals.css). Focus moves into the dialog and is trapped there, Escape closes it, and focus goes back to
 * whatever opened it. */
function ModalShell({ labelId, onClose, maxWidth, busy, children }: { labelId: string; onClose: () => void; maxWidth: number; busy?: boolean; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus({ preventScroll: true })
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialogRef.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return createPortal(
    <motion.div className="print-portal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => { if (!busy) onClose() }}
    >
      <motion.div ref={dialogRef} className="print-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelId}
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth, maxHeight: '94vh', overflowY: 'auto', padding: 'clamp(16px, 2vw, 28px)', boxShadow: '0 24px 48px rgba(0,0,0,0.25)', fontFamily: 'Poppins,sans-serif', outline: 'none' }}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  )
}

function CloseButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label="Close" className="no-print" style={{ width: 44, height: 44, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#5f6b7d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={22} /></button>
}

const secondaryButton: CSSProperties = { minHeight: 44, padding: '0 22px', border: '1px solid #e2e6ec', borderRadius: 10, background: '#f7f9fc', color: '#374151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const primaryButton: CSSProperties = { minHeight: 44, padding: '0 22px', border: 'none', borderRadius: 10, background: GREEN, color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }

// ---------------------------------------------------------------------------------------------------------------
// Printable sheets
// ---------------------------------------------------------------------------------------------------------------

/** The double-ruled certificate frame from the mockup: hospital heading, a title, a body, and a footer row. */
function CertificateFrame({ title, subtitle, footerLeft, footerRight, children }: { title: string; subtitle: string; footerLeft: ReactNode; footerRight: ReactNode; children: ReactNode }) {
  return (
    <div className="print-sheet" style={{ border: '1.5px solid #3b9576', borderRadius: 14, padding: 5, color: '#111827' }}>
      <div style={{ border: '1px solid #3b9576', borderRadius: 10, background: '#f8fcfb', padding: 'clamp(18px, 2.6vw, 40px)' }}>
        <div style={{ paddingBottom: 14, borderBottom: '1px solid #dbe6e2' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: '#006042' }}>REPUBLIC OF THE PHILIPPINES</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>Veterans Memorial Medical Center</div>
          <div style={{ fontSize: 13, color: '#55667e', marginTop: 2 }}>North Avenue, Diliman, Quezon City</div>
        </div>
        <h2 id="print-title" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.07em', textAlign: 'center', textTransform: 'uppercase', margin: '26px 0 6px', lineHeight: 1.3 }}>{title}</h2>
        <p style={{ fontSize: 13, fontStyle: 'italic', color: '#55667e', textAlign: 'center', margin: 0 }}>{subtitle}</p>
        <div style={{ marginTop: 22, background: '#fff', border: '1px solid #e4ebe8', borderRadius: 10, padding: 'clamp(16px, 1.8vw, 26px)', fontSize: 13, lineHeight: 1.65 }}>{children}</div>
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>{footerLeft}</div>
          <div style={{ minWidth: 220, textAlign: 'center' }}>{footerRight}</div>
        </div>
      </div>
    </div>
  )
}

function Fact({ label, children, danger }: { label: string; children: ReactNode; danger?: boolean }) {
  return <li style={{ marginTop: 2 }}>{label}: <strong style={{ color: danger ? '#b42318' : '#006042' }}>{children}</strong></li>
}

/** Annual TB Health Clearance Certificate. Only ever fetched for a cleared person; the API refuses otherwise,
 * and that refusal is shown as-is. Everything on the sheet comes from the approved exam — nothing is invented. */
export function CertificateModal({ row, onClose }: { row: ApeRow; onClose: () => void }) {
  const [cert, setCert] = useState<ClearanceCertificate | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get<ClearanceCertificate>(`/registry/certificate/${row.id}`)
      .then((c) => { if (!cancelled) setCert(c) })
      .catch((err) => { if (!cancelled) setError(apiMessage(err, 'The certificate could not be loaded. Please try again.')) })
    return () => { cancelled = true }
  }, [row.id])

  const hasExam = Boolean(cert?.examDate)
  return (
    <ModalShell labelId="print-title" onClose={onClose} maxWidth={860}>
      {!cert && !error && <div role="status" style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: '#5f6b7d' }}>Preparing the certificate for {row.fullName}…</div>}
      {error && (
        <div style={{ padding: '24px 4px' }}>
          <h2 id="print-title" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Certificate unavailable</h2>
          <p role="alert" style={{ fontSize: 14, color: '#b42318', fontWeight: 600, margin: '10px 0 0' }}>{error}</p>
        </div>
      )}
      {cert && (
        <CertificateFrame
          title="Annual TB Health Clearance Certificate"
          subtitle="In compliance with National TB Control Program & VMMC Infection Control Guidelines"
          footerLeft={<><div>Date Issued: <strong>{longDate(cert.issuedAt)}</strong></div><div>Valid Until: <strong>{longDate(cert.validUntil)}</strong></div></>}
          footerRight={
            <>
              {cert.signatory.signatureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cert.signatory.signatureUrl} alt={`Signature of ${cert.signatory.fullName}`} style={{ display: 'block', margin: '0 auto 4px', maxHeight: 64, maxWidth: 220, objectFit: 'contain' }} />
              )}
              <div style={{ borderTop: '2px solid #cdd6d3', paddingTop: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{cert.signatory.fullName}</div>
                {cert.signatory.jobTitle && <div style={{ fontSize: 13, color: '#55667e' }}>{cert.signatory.jobTitle}</div>}
              </div>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            This is to certify that <strong>{cert.employee.fullName}</strong>, serving in the department of <strong>{cert.employee.department}</strong> (Employee ID: <strong>{cert.employee.employeeId}</strong>), has undergone mandatory Tuberculosis Health Surveillance.
          </p>
          <ul style={{ margin: '14px 0', paddingLeft: 22 }}>
            <Fact label="Chest Radiograph Status" danger={isDangerFinding(cert.cxrResult)}>{cxrText(cert.cxrResult, hasExam)}</Fact>
            {cert.genexpertResult !== 'NOT_APPLICABLE' && <Fact label="GeneXpert Status" danger={isDangerFinding(cert.genexpertResult)}>{genexpertText(cert.genexpertResult, hasExam)}</Fact>}
            {cert.examDate && <Fact label="Annual Physical Exam Date">{longDate(cert.examDate)}</Fact>}
          </ul>
          <p style={{ margin: 0 }}>
            The above employee is hereby declared <strong style={{ color: '#006042', textDecoration: 'underline' }}>FIT FOR DUTY</strong> without restrictions regarding airborne transmission hazards.
          </p>
        </CertificateFrame>
      )}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} style={secondaryButton}>Cancel</button>
        <button type="button" onClick={() => window.print()} disabled={!cert} style={{ ...primaryButton, opacity: cert ? 1 : 0.6, cursor: cert ? 'pointer' : 'default' }}>
          <Printer size={18} aria-hidden="true" /> Print Clearance Certificate
        </button>
      </div>
    </ModalShell>
  )
}

/** Printout of one person's pre-employment record. Unlike the annual certificate there is no reviewer on this
 * record, so it names the admin who printed it rather than inventing a signatory. */
export function PreEmploymentPrintModal({ row, printedBy, onClose }: { row: PreEmploymentRow; printedBy: string; onClose: () => void }) {
  return (
    <ModalShell labelId="print-title" onClose={onClose} maxWidth={860}>
      <CertificateFrame
        title="Pre-Employment Health Record"
        subtitle="Baseline screening on file with the VMMC TB DOTS Unit"
        footerLeft={<><div>Cleared On: <strong>{row.clearedAt ? longDate(row.clearedAt) : '—'}</strong></div><div>Printed On: <strong>{longDate(new Date().toISOString())}</strong></div></>}
        footerRight={<div style={{ borderTop: '2px solid #cdd6d3', paddingTop: 8 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{printedBy || 'TB DOTS Unit'}</div><div style={{ fontSize: 13, color: '#55667e' }}>Printed from the Modules Registry</div></div>}
      >
        <p style={{ margin: 0 }}>
          Pre-employment record of <strong>{row.fullName}</strong>{row.jobTitle ? <>, {row.jobTitle},</> : null} in the department of <strong>{row.department.name}</strong> (Employee ID: <strong>{row.employeeId}</strong>).
        </p>
        <ul style={{ margin: '14px 0', paddingLeft: 22 }}>
          <Fact label="Baseline Skin / Blood Test">{row.screeningResult?.trim() || 'No result entered'}</Fact>
          <Fact label="Status">{row.fitForDuty ? 'Passed — cleared fit for duty' : 'Not yet cleared'}</Fact>
        </ul>
      </CertificateFrame>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} style={secondaryButton}>Cancel</button>
        <button type="button" onClick={() => window.print()} style={primaryButton}><Printer size={18} aria-hidden="true" /> Print Record</button>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Add / update a health record
// ---------------------------------------------------------------------------------------------------------------

export type RecordKind = 'pre-employment' | 'pep' | 'immunization'

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  'pre-employment': 'Pre-Employment Clearance',
  pep: 'Exposure (PEP) Log',
  immunization: 'Immunization Dose',
}

interface PepLogApi { id: string; exposure_date: string; exposure_type: string; prophylaxis_status: string; follow_up_date: string | null; notes: string | null }
interface DoseApi { id: string; vaccine_type: string; dose: number; administered_date: string; next_due_date: string | null; quarter: string | null }
interface PreEmploymentApi { screening_result: string | null; fit_for_duty: boolean; cleared_at: string | null }

const fieldLabel: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: '#454545', marginBottom: 6 }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #cfd6df', borderRadius: 10, background: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, color: '#1f2937', boxSizing: 'border-box', minHeight: 44, padding: '0 14px' }
const focusRing = 'outline-none placeholder:text-[#767676] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006042]'
const today = () => new Date().toISOString().slice(0, 10)

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div><label htmlFor={htmlFor} style={fieldLabel}>{label}</label>{children}</div>
}

function SelectBox({ id, value, onChange, children }: { id: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={focusRing} style={{ ...inputStyle, padding: '0 44px 0 14px', appearance: 'none', cursor: 'pointer' }}>{children}</select>
      <ChevronDown size={18} color="#333" aria-hidden="true" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </div>
  )
}

function PersonPicker({ people, onPick }: { people: RegistryPerson[]; onPick: (p: RegistryPerson) => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const matches = query.trim() ? people.filter((p) => matchesSearch(p, query)).slice(0, 6) : []
  return (
    <div>
      <label htmlFor={id} style={fieldLabel}>Staff member</label>
      <div style={{ position: 'relative' }}>
        <Search size={17} color="#5f6b7d" aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, ID, or department" autoComplete="off" className={focusRing} style={{ ...inputStyle, paddingLeft: 42 }} />
      </div>
      {query.trim() && (
        <ul aria-label="Matching staff" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, border: '1px solid #e2e6ec', borderRadius: 10, overflow: 'hidden' }}>
          {matches.length === 0 && <li style={{ padding: '12px 14px', fontSize: 13, color: '#5f6b7d' }}>No staff match &ldquo;{query.trim()}&rdquo;.</li>}
          {matches.map((p) => (
            <li key={p.id} style={{ borderTop: '1px solid #eef1f5' }}>
              <button type="button" onClick={() => onPick(p)} style={{ width: '100%', textAlign: 'left', minHeight: 48, padding: '6px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827' }}>{p.fullName}</span>
                <span style={{ display: 'block', fontSize: 13, color: '#5f6b7d' }}>{p.employeeId} · {p.department.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One window for the three record types an admin can add by hand. Opened from a row (record type and person
 * fixed, with that person's history shown) or from "Add Health Record" (pick a type, then a person). */
export function RecordModal({ initialKind, lockKind, person: initialPerson, people, note, onClose, onChanged }: {
  initialKind: RecordKind
  lockKind: boolean
  person: RegistryPerson | null
  people: RegistryPerson[]
  /** Extra guidance under the heading (e.g. why APE records can't be added from here). */
  note?: string
  onClose: () => void
  onChanged: (kind: RecordKind) => void
}) {
  const uid = useId()
  const [kind, setKind] = useState<RecordKind>(initialKind)
  const [person, setPerson] = useState<RegistryPerson | null>(initialPerson)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [history, setHistory] = useState<{ kind: RecordKind; personId: string; items: PepLogApi[] | DoseApi[] } | null>(null)
  const [historyError, setHistoryError] = useState('')

  // pre-employment
  const [screening, setScreening] = useState('')
  const [fit, setFit] = useState(false)
  // PEP
  const [exposureDate, setExposureDate] = useState(today())
  const [exposureType, setExposureType] = useState('')
  const [prophylaxis, setProphylaxis] = useState('PENDING')
  const [followUp, setFollowUp] = useState('')
  const [pepNotes, setPepNotes] = useState('')
  // immunization
  const [vaccine, setVaccine] = useState('')
  const [dose, setDose] = useState('1')
  const [given, setGiven] = useState(today())
  const [nextDue, setNextDue] = useState('')
  const [quarter, setQuarter] = useState('')

  const titleId = `${uid}-title`
  const personId = person?.id ?? null

  // Load what's already on file for this person: the pre-employment record to edit, or the PEP / dose history.
  useEffect(() => {
    if (!personId) return
    let cancelled = false
    setHistoryError('')
    if (kind === 'pre-employment') {
      api.get<PreEmploymentApi | null>(`/pre-employment/${personId}`)
        .then((rec) => { if (!cancelled) { setScreening(rec?.screening_result ?? ''); setFit(rec?.fit_for_duty ?? false) } })
        .catch((err) => { if (!cancelled) setHistoryError(apiMessage(err, 'Could not load the existing record.')) })
    } else {
      api.get<PepLogApi[] | DoseApi[]>(kind === 'pep' ? `/pep-logs/${personId}` : `/immunizations/${personId}`)
        .then((items) => { if (!cancelled) setHistory({ kind, personId, items }) })
        .catch((err) => { if (!cancelled) setHistoryError(apiMessage(err, 'Could not load the existing entries.')) })
    }
    return () => { cancelled = true }
  }, [kind, personId, reloadKey])

  const switchKind = (next: RecordKind) => { setKind(next); setError(''); setNotice('') }
  const choosePerson = (p: RegistryPerson | null) => { setPerson(p); setHistory(null); setError(''); setNotice('') }

  const done = (message: string) => { setNotice(message); setReloadKey((k) => k + 1); onChanged(kind) }

  const save = async () => {
    if (!person) return
    setError('')
    setNotice('')
    try {
      if (kind === 'pre-employment') {
        setSaving(true)
        await api.put(`/pre-employment/${person.id}`, { screeningResult: screening.trim(), fitForDuty: fit })
        done(`Pre-employment record saved for ${person.fullName}.`)
      } else if (kind === 'pep') {
        if (!exposureDate) { setError('Enter the date of the exposure.'); return }
        if (!exposureType.trim()) { setError('Describe the type of exposure.'); return }
        setSaving(true)
        await api.post(`/pep-logs/${person.id}`, {
          exposureDate, exposureType: exposureType.trim(), prophylaxisStatus: prophylaxis,
          ...(followUp && { followUpDate: followUp }), ...(pepNotes.trim() && { notes: pepNotes.trim() }),
        })
        setExposureType(''); setFollowUp(''); setPepNotes(''); setProphylaxis('PENDING')
        done(`Exposure logged for ${person.fullName}.`)
      } else {
        const doseNumber = Number(dose)
        if (!vaccine.trim()) { setError('Enter the vaccine name.'); return }
        if (!Number.isInteger(doseNumber) || doseNumber < 1) { setError('The dose number must be a whole number, 1 or more.'); return }
        if (!given) { setError('Enter the date the dose was given.'); return }
        setSaving(true)
        await api.post(`/immunizations/${person.id}`, {
          vaccineType: vaccine.trim(), dose: doseNumber, administeredDate: given,
          ...(nextDue && { nextDueDate: nextDue }), ...(quarter && { quarter }),
        })
        setNextDue(''); setDose(String(doseNumber + 1))
        done(`Dose recorded for ${person.fullName}.`)
      }
    } catch (err) {
      setError(apiMessage(err, 'Could not save the record. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const updatePepStatus = async (logId: string, status: string) => {
    setError('')
    setNotice('')
    try {
      await api.patch(`/pep-logs/${logId}`, { prophylaxisStatus: status })
      done('Exposure status updated.')
    } catch (err) {
      setError(apiMessage(err, 'Could not update the status. Please try again.'))
    }
  }

  const heading = lockKind && person ? `${RECORD_KIND_LABEL[kind]}: ${person.fullName}` : 'Add Health Record'
  const currentHistory = history && history.kind === kind && history.personId === personId ? history.items : null

  return (
    <ModalShell labelId={titleId} onClose={onClose} maxWidth={720} busy={saving}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 14, borderBottom: '1px solid #eef1f5' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={titleId} style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.3 }}>{heading}</h2>
          <p style={{ fontSize: 13, color: '#55667e', margin: '3px 0 0' }}>
            {kind === 'pre-employment' ? 'Saved to the staff member’s pre-employment record; saving again updates it.' : 'Adds a new entry to the staff member’s history.'}
          </p>
          {note && <p style={{ fontSize: 13, color: '#55667e', margin: '6px 0 0' }}>{note}</p>}
        </div>
        <CloseButton onClick={onClose} disabled={saving} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
        {!lockKind && (
          <Field label="Record type" htmlFor={`${uid}-kind`}>
            <SelectBox id={`${uid}-kind`} value={kind} onChange={(v) => switchKind(v as RecordKind)}>
              {(Object.keys(RECORD_KIND_LABEL) as RecordKind[]).map((k) => <option key={k} value={k}>{RECORD_KIND_LABEL[k]}</option>)}
            </SelectBox>
          </Field>
        )}

        {person ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f4f7fb', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{person.fullName}</div>
              <div style={{ fontSize: 13, color: '#55667e' }}>{person.employeeId} · {person.department.name}</div>
            </div>
            {!initialPerson && <button type="button" onClick={() => choosePerson(null)} style={{ ...secondaryButton, minHeight: 44, padding: '0 16px', fontSize: 13 }}>Change</button>}
          </div>
        ) : (
          <PersonPicker people={people} onPick={choosePerson} />
        )}

        {person && kind === 'pre-employment' && (
          <>
            <Field label="Baseline skin / blood test result" htmlFor={`${uid}-screen`}>
              <input id={`${uid}-screen`} value={screening} onChange={(e) => setScreening(e.target.value)} maxLength={200} placeholder="e.g. TST Mantoux (Negative, 0 mm)" className={focusRing} style={inputStyle} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#1f2937', cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} style={{ width: 22, height: 22, accentColor: GREEN }} />
              Cleared fit for duty (pre-employment screening passed)
            </label>
          </>
        )}

        {person && kind === 'pep' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Date of exposure *" htmlFor={`${uid}-expdate`}><input id={`${uid}-expdate`} type="date" value={exposureDate} max={today()} onChange={(e) => setExposureDate(e.target.value)} className={focusRing} style={inputStyle} /></Field>
              <Field label="Follow-up date" htmlFor={`${uid}-follow`}><input id={`${uid}-follow`} type="date" value={followUp} min={exposureDate} onChange={(e) => setFollowUp(e.target.value)} className={focusRing} style={inputStyle} /></Field>
            </div>
            <Field label="Type of exposure *" htmlFor={`${uid}-exptype`}>
              <input id={`${uid}-exptype`} value={exposureType} onChange={(e) => setExposureType(e.target.value)} list={`${uid}-exptypes`} placeholder="e.g. Needlestick injury" className={focusRing} style={inputStyle} />
              <datalist id={`${uid}-exptypes`}><option value="Needlestick injury" /><option value="Splash exposure" /><option value="Airborne TB exposure" /></datalist>
            </Field>
            <Field label="Prophylaxis status" htmlFor={`${uid}-prophylaxis`}>
              <SelectBox id={`${uid}-prophylaxis`} value={prophylaxis} onChange={setProphylaxis}>
                {Object.entries(PEP_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectBox>
            </Field>
            <Field label="Notes" htmlFor={`${uid}-pepnotes`}>
              <textarea id={`${uid}-pepnotes`} value={pepNotes} onChange={(e) => setPepNotes(e.target.value)} rows={3} className={focusRing} style={{ ...inputStyle, padding: '12px 14px', resize: 'vertical' }} />
            </Field>
          </>
        )}

        {person && kind === 'immunization' && (
          <>
            <Field label="Vaccine *" htmlFor={`${uid}-vaccine`}>
              <input id={`${uid}-vaccine`} value={vaccine} onChange={(e) => setVaccine(e.target.value)} list={`${uid}-vaccines`} placeholder="e.g. Influenza" className={focusRing} style={inputStyle} />
              <datalist id={`${uid}-vaccines`}><option value="Influenza" /><option value="Hepatitis B" /><option value="BCG" /><option value="COVID-19" /></datalist>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Dose number *" htmlFor={`${uid}-dose`}><input id={`${uid}-dose`} type="number" min={1} step={1} value={dose} onChange={(e) => setDose(e.target.value)} className={focusRing} style={inputStyle} /></Field>
              <Field label="Date given *" htmlFor={`${uid}-given`}><input id={`${uid}-given`} type="date" value={given} max={today()} onChange={(e) => setGiven(e.target.value)} className={focusRing} style={inputStyle} /></Field>
              <Field label="Next dose due" htmlFor={`${uid}-nextdue`}><input id={`${uid}-nextdue`} type="date" value={nextDue} min={given} onChange={(e) => setNextDue(e.target.value)} className={focusRing} style={inputStyle} /></Field>
            </div>
            <Field label="Quarter" htmlFor={`${uid}-quarter`}>
              <SelectBox id={`${uid}-quarter`} value={quarter} onChange={setQuarter}>
                <option value="">Not specified</option>
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <option key={q} value={q}>{q}</option>)}
              </SelectBox>
            </Field>
          </>
        )}

        {person && (kind === 'pep' || kind === 'immunization') && (
          <section aria-labelledby={`${uid}-history`}>
            <h3 id={`${uid}-history`} style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.03em', textTransform: 'uppercase', margin: '4px 0 8px' }}>{kind === 'pep' ? 'Exposure history' : 'Dose history'}</h3>
            {!currentHistory && !historyError && <div role="status" style={{ fontSize: 13, color: '#5f6b7d' }}>Loading…</div>}
            {currentHistory && currentHistory.length === 0 && <div style={{ fontSize: 13, color: '#5f6b7d' }}>{kind === 'pep' ? 'No exposures on file.' : 'No doses on file.'}</div>}
            {currentHistory && currentHistory.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kind === 'pep'
                  ? (currentHistory as PepLogApi[]).map((log) => <PepHistoryItem key={log.id} log={log} onUpdate={updatePepStatus} />)
                  : (currentHistory as DoseApi[]).map((d) => (
                    <li key={d.id} style={{ border: '1px solid #e2e6ec', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                      <strong style={{ fontWeight: 600 }}>{d.vaccine_type} — Dose {d.dose}</strong>
                      <span style={{ color: '#55667e' }}> · given {isoDay(d.administered_date)}{d.next_due_date ? ` · next due ${isoDay(d.next_due_date)}` : ''}{d.quarter ? ` · ${d.quarter}` : ''}</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {historyError && <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#b42318', margin: 0 }}>{historyError}</p>}
        {error && <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#b42318', margin: 0 }}>{error}</p>}
        {notice && <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#00703f', margin: 0 }}><Check size={18} aria-hidden="true" /> {notice}</p>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} disabled={saving} style={secondaryButton}>Close</button>
        <button type="button" onClick={save} disabled={saving || !person} style={{ ...primaryButton, opacity: saving || !person ? 0.6 : 1, cursor: saving || !person ? 'default' : 'pointer' }}>
          {saving ? 'Saving…' : kind === 'pre-employment' ? 'Save Pre-Employment Record' : kind === 'pep' ? 'Log Exposure' : 'Record Dose'}
        </button>
      </div>
    </ModalShell>
  )
}

function PepHistoryItem({ log, onUpdate }: { log: PepLogApi; onUpdate: (id: string, status: string) => Promise<void> }) {
  const id = useId()
  const active = isPepActive(log.prophylaxis_status)
  const [status, setStatus] = useState(log.prophylaxis_status)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async () => { setBusy(true); await onUpdate(log.id, status); setBusy(false) }, [log.id, status, onUpdate])
  return (
    <li style={{ border: '1px solid #e2e6ec', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div><strong style={{ fontWeight: 600 }}>{log.exposure_type}</strong> <span style={{ color: '#55667e' }}>· {isoDay(log.exposure_date)}{log.follow_up_date ? ` · follow-up ${isoDay(log.follow_up_date)}` : ''}</span></div>
      <div style={{ color: active ? '#8a3b00' : '#00703f', fontWeight: 600, marginTop: 2 }}>{PEP_STATUS_LABEL[log.prophylaxis_status] ?? log.prophylaxis_status}</div>
      {log.notes && <div style={{ color: '#374151', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{log.notes}&rdquo;</div>}
      {active && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor={id} style={fieldLabel}>Change status</label>
            <SelectBox id={id} value={status} onChange={setStatus}>{Object.entries(PEP_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectBox>
          </div>
          <button type="button" onClick={run} disabled={busy || status === log.prophylaxis_status} style={{ ...secondaryButton, opacity: busy || status === log.prophylaxis_status ? 0.6 : 1 }}>{busy ? 'Updating…' : 'Update'}</button>
        </div>
      )}
    </li>
  )
}
