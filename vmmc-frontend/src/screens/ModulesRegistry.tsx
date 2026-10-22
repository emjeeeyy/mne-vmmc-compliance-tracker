'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Building2, CalendarClock, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, FlaskConical, IdCard, Plus, Printer, RefreshCw, ScanLine,
  Search, Syringe, Timer, User, UserCheck, Microscope,
} from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { getInitials, getUser } from '@/lib/auth'
import {
  BUCKET_LABEL, BUCKET_SHORT, clampPage, cxrText, exposureDay, filterRows, genexpertText, isDangerFinding, isoDay, isPepActive, monthYear, PEP_STATUS_LABEL, STATUS_FILTER_LABEL,
  type ApeRow, type ImmunizationRow, type PepRow, type PreEmploymentRow, type RegistryBucket, type RegistryPerson, type StatusFilter,
} from '@/lib/registry'
import { CertificateModal, PreEmploymentPrintModal, RecordModal, type RecordKind } from './RegistryModals'

type TabKey = 'ape' | 'pre-employment' | 'pep' | 'immunization'

const GREEN = '#006042'
const ACTION_GREEN = '#008541'
const PAGE_SIZE = 10
const PASSPORT_STEP = 6

const TABS: { key: TabKey; label: string; icon: ReactNode; path: string }[] = [
  { key: 'ape', label: '1. Annual Physical Exam (APE)', icon: <CalendarDays size={18} aria-hidden="true" />, path: '/registry/ape' },
  { key: 'pre-employment', label: '2. Pre-Employment Clearances', icon: <UserCheck size={18} aria-hidden="true" />, path: '/registry/pre-employment' },
  { key: 'pep', label: '3. Exposure (PEP) Logs', icon: <Timer size={18} aria-hidden="true" />, path: '/registry/pep' },
  { key: 'immunization', label: '4. Quarterly Immunizations', icon: <Syringe size={18} aria-hidden="true" />, path: '/registry/immunizations' },
]

/** Which statuses a tab can actually produce — the filter only offers those (the APE tab never has "No Record"). */
const TAB_FILTERS: Record<TabKey, StatusFilter[]> = {
  ape: ['ALL', 'UP_TO_DATE', 'DUE_SOON', 'OVERDUE'],
  'pre-employment': ['ALL', 'UP_TO_DATE', 'OVERDUE', 'NO_RECORD'],
  pep: ['ALL', 'UP_TO_DATE', 'DUE_SOON', 'OVERDUE'],
  immunization: ['ALL', 'UP_TO_DATE', 'DUE_SOON', 'OVERDUE', 'NO_RECORD'],
}

const PILL: Record<RegistryBucket, { bg: string; fg: string }> = {
  UP_TO_DATE: { bg: '#dff3e6', fg: '#00643a' },
  DUE_SOON: { bg: '#fff0bd', fg: '#764000' },
  OVERDUE: { bg: '#ffe0e3', fg: '#b42318' },
  NO_RECORD: { bg: '#eaeef3', fg: '#475569' },
}

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow or unavailable. Please try again.'
  return fallback
}

function useRegistry<T>(path: string, active: boolean, version: number) {
  const [state, setState] = useState<{ rows: T[]; loading: boolean; error: string }>({ rows: [], loading: true, error: '' })
  useEffect(() => {
    if (!active) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    api.get<T[]>(path)
      .then((rows) => { if (!cancelled) setState({ rows: rows ?? [], loading: false, error: '' }) })
      .catch((err) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: apiMessage(err, 'Could not load this module. Please try again.') })) })
    return () => { cancelled = true }
  }, [path, active, version])
  return state
}

// ---------------------------------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------------------------------

function StatusPill({ bucket, short }: { bucket: RegistryBucket; short?: boolean }) {
  const c = PILL[bucket]
  return (
    <span style={{ display: 'inline-block', maxWidth: '100%', background: c.bg, color: c.fg, borderRadius: 8, padding: short ? '5px 12px' : '6px 12px', fontSize: short ? 14 : 13, fontWeight: 700, letterSpacing: short ? 0 : '0.03em', textTransform: short ? 'none' : 'uppercase', lineHeight: 1.3, textAlign: 'center' }}>
      {short ? BUCKET_SHORT[bucket] : BUCKET_LABEL[bucket]}
    </span>
  )
}

function ActionButton({ children, onClick, label, tone = 'green' }: { children: ReactNode; onClick: () => void; label: string; tone?: 'green' | 'dark' }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40, minWidth: 64, padding: '0 14px', border: 'none', borderRadius: 8, background: tone === 'dark' ? '#1b2230' : ACTION_GREEN, color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  )
}

const mutedText = { fontSize: 13, color: '#5f6b7d' } as const

function Identity({ row }: { row: RegistryPerson }) {
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{row.fullName}</div>
      <div style={{ fontSize: 13, color: '#5f6b7d', marginTop: 2 }}>{row.employeeId}</div>
    </>
  )
}

/** Accessible single-select (button + listbox): the mockup's rounded menu, operable from the keyboard. */
function StatusSelect({ value, options, onChange }: { value: StatusFilter; options: StatusFilter[]; onChange: (v: StatusFilter) => void }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.indexOf(value)))
    listRef.current?.focus()
  }, [open, options, value])

  const choose = (v: StatusFilter) => { onChange(v); setOpen(false); buttonRef.current?.focus() }
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); buttonRef.current?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <span id={`${id}-label`} className="sr-only">Filter by status</span>
      <button ref={buttonRef} type="button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((o) => !o)}
        className="outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006042]"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, padding: '0 16px', border: 'none', borderRadius: 12, background: '#f4f7fb', color: '#1f3151', fontFamily: 'Poppins,sans-serif', fontSize: 13, cursor: 'pointer' }}
      >
        <span id={`${id}-value`}>{STATUS_FILTER_LABEL[value]}</span>
        <ChevronDown size={18} color="#4a5568" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <>
          <div aria-hidden="true" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <ul ref={listRef} role="listbox" tabIndex={-1} aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-opt-${active}`} onKeyDown={onKey}
            style={{ position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0, right: 0, minWidth: 260, margin: 0, padding: 6, listStyle: 'none', background: '#fff', border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: '0 12px 28px rgba(15,23,42,0.18)', outline: 'none' }}
          >
            {options.map((o, i) => (
              <li key={o} id={`${id}-opt-${i}`} role="option" aria-selected={o === value} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 14px', borderRadius: 8, fontSize: 13, color: '#1f3151', fontWeight: o === value ? 600 : 400, background: i === active ? '#eef3f8' : 'transparent', cursor: 'pointer' }}
              >
                {STATUS_FILTER_LABEL[o]}
                {o === value && <Check size={16} color={GREEN} aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------------------------------------------

function TabStrip({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -index : e.key === 'End' ? TABS.length - 1 - index : 0
    if (!move) return
    e.preventDefault()
    const next = TABS[(index + move + TABS.length) % TABS.length]
    onChange(next.key)
    refs.current[next.key]?.focus()
  }
  return (
    <div role="tablist" aria-label="Health screening modules" style={{ display: 'flex', gap: 'clamp(8px, 1.6vw, 36px)', marginTop: 22, borderBottom: '2px solid #e6ecf1', overflowX: 'auto' }}>
      {TABS.map((t, i) => {
        const selected = t.key === active
        return (
          <button key={t.key} ref={(el) => { refs.current[t.key] = el }} role="tab" id={`tab-${t.key}`} aria-selected={selected} aria-controls="registry-panel" tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}
            className="outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#006042]"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 46, padding: '0 clamp(10px, 1vw, 18px)', marginBottom: -2, border: 'none', borderBottom: `3px solid ${selected ? GREEN : 'transparent'}`, background: 'none', color: selected ? GREEN : '#5f6b7d', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: selected ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {t.icon}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Generic table / card list
// ---------------------------------------------------------------------------------------------------------------

interface Col<T> {
  key: string
  label: string
  width: string
  icon?: ReactNode
  align?: 'left' | 'center'
  /** identity = name + ID (also the card heading); status = the clearance pill (also on the card heading); action = the row button. */
  role?: 'identity' | 'status' | 'action'
  render: (row: T) => ReactNode
}

const headIcon = (node: ReactNode) => <span style={{ color: '#788ba5', display: 'inline-flex' }}>{node}</span>

function RegistryList<T extends RegistryPerson & { bucket: RegistryBucket }>({ columns, rows, caption, loading, error, onRetry, page, onPage, emptyText }: {
  columns: Col<T>[]; rows: T[]; caption: string; loading: boolean; error: string; onRetry: () => void; page: number; onPage: (p: number) => void; emptyText: string
}) {
  const current = clampPage(page, rows.length, PAGE_SIZE)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const showSkeleton = loading && rows.length === 0
  const empty = !loading && !error && rows.length === 0
  const status = columns.find((c) => c.role === 'status')
  const action = columns.find((c) => c.role === 'action')
  const facts = columns.filter((c) => !c.role)

  return (
    <div>
      <p role="status" className="sr-only">{loading ? 'Loading' : `${rows.length} ${rows.length === 1 ? 'person' : 'people'} shown`}</p>
      {error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fff5f5', border: '1px solid #feb2b2', color: '#9b1c1c', borderRadius: 12, padding: '14px 18px', fontSize: 13, fontWeight: 600, margin: 16 }}>
          {error}
          <button type="button" onClick={onRetry} style={{ minHeight: 44, padding: '0 18px', border: '1px solid #feb2b2', borderRadius: 8, background: '#fff', color: '#9b1c1c', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>
      )}

      <div className="hidden xl:block" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <caption className="sr-only">{caption}</caption>
          <colgroup>{columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
          <thead>
            <tr style={{ background: '#f4f7fb', height: 56 }}>
              {columns.map((c, i) => (
                <th key={c.key} scope="col" style={{ textAlign: c.align ?? 'left', padding: i === 0 ? '0 10px 0 22px' : '0 10px', fontSize: 13, fontWeight: 600, color: '#1a2b41', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.25 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>{c.icon}{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSkeleton && [0, 1, 2, 3].map((i) => (
              <tr key={i} style={{ height: 68, borderTop: '1px solid #eef1f5' }}><td colSpan={columns.length} style={{ padding: '0 22px' }}><div style={{ height: 14, width: `${78 - i * 12}%`, borderRadius: 6, background: '#eef1f5' }} /></td></tr>
            ))}
            {visible.map((row) => (
              <tr key={row.id} style={{ height: 68, borderTop: '1px solid #eef1f5' }}>
                {columns.map((c, i) => (
                  <td key={c.key} style={{ padding: i === 0 ? '10px 10px 10px 22px' : '10px', textAlign: c.align ?? 'left', fontSize: 13, color: '#374151', lineHeight: 1.4, verticalAlign: 'middle', overflow: i === 0 ? 'hidden' : undefined }}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The visibility class sits on a wrapper: an inline `display: grid` on the list itself would beat `xl:hidden`. */}
      <div className="xl:hidden">
      <ul style={{ listStyle: 'none', margin: 0, padding: 'clamp(12px, 2vw, 20px)', display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
        {showSkeleton && [0, 1].map((i) => <li key={i} style={{ height: 130, borderRadius: 14, background: '#f4f7fb' }} />)}
        {visible.map((row) => (
          <li key={row.id} style={{ border: '1px solid #e5e9f0', borderRadius: 14, padding: 16, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}><Identity row={row} /></div>
              {status && <div style={{ flexShrink: 0, maxWidth: '55%' }}>{status.render(row)}</div>}
            </div>
            <dl style={{ margin: '12px 0 0', display: 'grid', gap: 6 }}>
              {facts.map((c) => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13 }}>
                  <dt style={{ color: '#5f6b7d', flexShrink: 0 }}>{c.label}</dt>
                  <dd style={{ margin: 0, color: '#1f2937', textAlign: 'right', minWidth: 0 }}>{c.render(row)}</dd>
                </div>
              ))}
            </dl>
            {action && <div style={{ marginTop: 14 }}>{action.render(row)}</div>}
          </li>
        ))}
      </ul>
      </div>

      {empty && <div style={{ padding: '44px 20px', textAlign: 'center', fontSize: 14, color: '#5f6b7d' }}>{emptyText}</div>}

      {rows.length > PAGE_SIZE && (
        <nav aria-label="Pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 22px', borderTop: '1px solid #eef1f5' }}>
          <span style={{ fontSize: 13, color: '#55667e' }}>Showing {current * PAGE_SIZE + 1}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of {rows.length}</span>
          <span style={{ display: 'inline-flex', gap: 10 }}>
            <PageButton label="Previous page" disabled={current === 0} onClick={() => onPage(current - 1)}><ChevronLeft size={18} aria-hidden="true" /> Previous</PageButton>
            <PageButton label="Next page" disabled={(current + 1) * PAGE_SIZE >= rows.length} onClick={() => onPage(current + 1)}>Next <ChevronRight size={18} aria-hidden="true" /></PageButton>
          </span>
        </nav>
      )}
    </div>
  )
}

function PageButton({ children, label, disabled, onClick }: { children: ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', border: '1px solid #d5dce6', borderRadius: 8, background: '#fff', color: '#1f3151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Passport cards
// ---------------------------------------------------------------------------------------------------------------

function PassportCard({ row, index, onOpen }: { row: ApeRow; index: number; onOpen: (row: ApeRow) => void }) {
  return (
    <motion.li custom={index} variants={fadeRise} initial="hidden" animate="visible"
      style={{ background: '#fff', borderRadius: 16, padding: 'clamp(14px, 1.2vw, 20px)', boxShadow: '0 2px 8px rgba(15,23,42,0.12)', border: '1px solid #e5e9f0', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 10, background: '#17233b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{getInitials(row.fullName)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 title={row.fullName} style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.fullName}</h3>
          <div style={{ ...mutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.jobTitle ?? '—'}</div>
        </div>
        <StatusPill bucket={row.bucket} short />
      </div>
      <dl style={{ margin: '14px 0 0', padding: '12px 0 0', borderTop: '1px solid #eef1f5', display: 'grid', gap: 6 }}>
        {[
          ['Dept', row.department.name],
          ['CXR Findings', cxrText(row.cxrResult, Boolean(row.lastExamDate))],
          ['Next Due', isoDay(row.nextDueDate)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <dt style={{ color: '#5f6b7d', flexShrink: 0 }}>{k}</dt>
            <dd style={{ margin: 0, color: '#1f2937', textAlign: 'right', minWidth: 0 }}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13, color: '#5f6b7d' }}>{row.employeeId}</span>
        {row.certificateAvailable ? (
          <button type="button" onClick={() => onOpen(row)} aria-label={`Open Health Passport for ${row.fullName}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 6px', border: 'none', background: 'none', color: '#00643a', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <IdCard size={18} aria-hidden="true" /> Health Passport
          </button>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 13, color: '#5f6b7d', fontWeight: 500 }}>Not yet cleared</span>
        )}
      </div>
    </motion.li>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------------

type ModalState =
  | { type: 'cert'; row: ApeRow }
  | { type: 'print-pre'; row: PreEmploymentRow }
  | { type: 'record'; kind: RecordKind; lock: boolean; person: RegistryPerson | null; note?: string }

export default function ModulesRegistry() {
  const [tab, setTab] = useState<TabKey>('ape')
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set<TabKey>(['ape']))
  const [versions, setVersions] = useState<Record<TabKey, number>>({ ape: 0, 'pre-employment': 0, pep: 0, immunization: 0 })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(0)
  const [passportCount, setPassportCount] = useState(PASSPORT_STEP)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const searchId = useId()

  const ape = useRegistry<ApeRow>('/registry/ape', true, versions.ape)
  const pre = useRegistry<PreEmploymentRow>('/registry/pre-employment', visited.has('pre-employment'), versions['pre-employment'])
  const pep = useRegistry<PepRow>('/registry/pep', visited.has('pep'), versions.pep)
  const imm = useRegistry<ImmunizationRow>('/registry/immunizations', visited.has('immunization'), versions.immunization)

  const refresh = (key: TabKey) => setVersions((v) => ({ ...v, [key]: v[key] + 1 }))
  const changeTab = (key: TabKey) => {
    setTab(key)
    setVisited((v) => (v.has(key) ? v : new Set(v).add(key)))
    setStatus('ALL')
    setPage(0)
  }

  const runScan = async () => {
    setScanning(true)
    setScanMessage(null)
    try {
      const result = await api.post<{ recordsProcessed: number; eventsEmitted: Record<string, number> }>('/monitoring/run-scan')
      const events = Object.values(result.eventsEmitted).reduce((a, b) => a + b, 0)
      setScanMessage({ text: `Scanned ${result.recordsProcessed} records — ${events} new event${events === 1 ? '' : 's'}.`, ok: true })
      ;(Object.keys(versions) as TabKey[]).forEach(refresh)
    } catch (err) {
      setScanMessage({ text: apiMessage(err, 'Scan failed. Please try again.'), ok: false })
    } finally {
      setScanning(false)
    }
  }

  const printedBy = getUser()?.fullName ?? ''
  const people: RegistryPerson[] = ape.rows
  const filters = TAB_FILTERS[tab]

  const apeRows = useMemo(() => filterRows(ape.rows, search, tab === 'ape' ? status : 'ALL'), [ape.rows, search, status, tab])
  const preRows = useMemo(() => filterRows(pre.rows, search, status), [pre.rows, search, status])
  const pepRows = useMemo(() => filterRows(pep.rows, search, status), [pep.rows, search, status])
  const immRows = useMemo(() => filterRows(imm.rows, search, status), [imm.rows, search, status])

  const openRecord = (kind: RecordKind, person: RegistryPerson | null, lock: boolean, note?: string) => setModal({ type: 'record', kind, person, lock, note })

  const identityCol = { key: 'who', label: 'Staff Member', icon: headIcon(<User size={17} aria-hidden="true" />), role: 'identity' as const, render: (r: RegistryPerson) => <Identity row={r} /> }
  const departmentCol = { key: 'dept', label: 'Department', icon: headIcon(<Building2 size={17} aria-hidden="true" />), render: (r: RegistryPerson) => r.department.name }
  const statusCol = <T extends { bucket: RegistryBucket }>(label: string, width: string): Col<T> => ({ key: 'status', label, width, icon: headIcon(<FlaskConical size={17} aria-hidden="true" />), align: 'center', role: 'status', render: (r) => <StatusPill bucket={r.bucket} /> })

  const apeColumns: Col<ApeRow>[] = [
    { ...identityCol, width: '16%' },
    { ...departmentCol, width: '12%' },
    { key: 'cxr', label: 'Chest Radiograph (CXR)', width: '14%', icon: headIcon(<ScanLine size={17} aria-hidden="true" />), render: (r) => <span style={{ color: isDangerFinding(r.cxrResult) ? '#b42318' : undefined, fontWeight: isDangerFinding(r.cxrResult) ? 600 : 400 }}>{cxrText(r.cxrResult, Boolean(r.lastExamDate))}</span> },
    { key: 'gx', label: 'GeneXpert / Sputum', width: '12%', icon: headIcon(<Microscope size={17} aria-hidden="true" />), render: (r) => <span style={{ color: isDangerFinding(r.genexpertResult) ? '#b42318' : undefined, fontWeight: isDangerFinding(r.genexpertResult) ? 600 : 400 }}>{genexpertText(r.genexpertResult, Boolean(r.lastExamDate))}</span> },
    { key: 'last', label: 'Last APE Date', width: '10%', icon: headIcon(<CalendarDays size={17} aria-hidden="true" />), render: (r) => isoDay(r.lastExamDate) },
    { key: 'next', label: 'Next Due', width: '10%', icon: headIcon(<CalendarClock size={17} aria-hidden="true" />), render: (r) => isoDay(r.nextDueDate) },
    statusCol<ApeRow>('Overall Clearance', '17%'),
    {
      key: 'action', label: 'Action', width: '9%', align: 'center', role: 'action',
      render: (r) => r.certificateAvailable
        ? <ActionButton onClick={() => setModal({ type: 'cert', row: r })} label={`Open clearance certificate for ${r.fullName}`}>CERT</ActionButton>
        : <span style={{ fontSize: 13, color: '#5f6b7d' }}>Not cleared</span>,
    },
  ]

  const preColumns: Col<PreEmploymentRow>[] = [
    { ...identityCol, width: '19%' },
    { key: 'role', label: 'Role Designation', width: '15%', icon: headIcon(<Building2 size={17} aria-hidden="true" />), render: (r) => r.jobTitle ?? '—' },
    {
      key: 'pestatus', label: 'Pre-Employment Status', width: '17%', icon: headIcon(<UserCheck size={17} aria-hidden="true" />),
      render: (r) => !r.hasRecord
        ? <span style={{ color: '#5f6b7d' }}>No record</span>
        : r.fitForDuty
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#00643a', fontWeight: 600 }}><Check size={17} aria-hidden="true" /> Passed{r.clearedAt ? ` (${new Date(r.clearedAt).getFullYear()})` : ''}</span>
          : <span style={{ color: '#764000', fontWeight: 600 }}>Not yet cleared</span>,
    },
    { key: 'baseline', label: 'Baseline Skin / Blood Test', width: '20%', icon: headIcon(<FlaskConical size={17} aria-hidden="true" />), render: (r) => r.screeningResult?.trim() || '—' },
    statusCol<PreEmploymentRow>('Overall Clearance', '15%'),
    {
      key: 'action', label: 'Action', width: '14%', align: 'center', role: 'action',
      render: (r) => r.fitForDuty
        ? <ActionButton onClick={() => setModal({ type: 'print-pre', row: r })} label={`Print pre-employment record for ${r.fullName}`}><Printer size={16} aria-hidden="true" /> PRINT</ActionButton>
        : <ActionButton onClick={() => openRecord('pre-employment', r, true)} label={`${r.hasRecord ? 'Update' : 'Add'} pre-employment record for ${r.fullName}`} tone="dark">{r.hasRecord ? 'Update' : 'Record'}</ActionButton>,
    },
  ]

  const pepColumns: Col<PepRow>[] = [
    { ...identityCol, width: '18%' },
    { ...departmentCol, width: '14%' },
    {
      key: 'exposure', label: 'Airborne Exposure PEP Log', width: '22%', icon: headIcon(<Timer size={17} aria-hidden="true" />),
      render: (r) => {
        if (!r.latest) return <span style={{ color: '#5f6b7d' }}>No exposure on file</span>
        const active = isPepActive(r.latest.prophylaxisStatus)
        const headline = active
          ? `Active surveillance (Day ${exposureDay(r.latest.exposureDate)})`
          : r.latest.prophylaxisStatus === 'DECLINED' ? `Prophylaxis declined (${monthYear(r.latest.exposureDate)})` : `Cleared exposure (${monthYear(r.latest.exposureDate)})`
        return <><strong style={{ fontWeight: 600, color: active ? '#b42318' : '#1f2937' }}>{headline}</strong><div style={{ fontSize: 13, color: '#5f6b7d' }}>{r.latest.exposureType}</div></>
      },
    },
    {
      key: 'followup', label: 'Follow-up Monitoring', width: '18%', icon: headIcon(<CalendarClock size={17} aria-hidden="true" />),
      render: (r) => r.latest && isPepActive(r.latest.prophylaxisStatus)
        ? <>{PEP_STATUS_LABEL[r.latest.prophylaxisStatus] ?? r.latest.prophylaxisStatus}<div style={{ fontSize: 13, color: r.bucket === 'OVERDUE' ? '#b42318' : '#5f6b7d', fontWeight: r.bucket === 'OVERDUE' ? 600 : 400 }}>{r.latest.followUpDate ? `Follow-up ${isoDay(r.latest.followUpDate)}${r.bucket === 'OVERDUE' ? ' — overdue' : ''}` : 'No follow-up date set'}</div></>
        : '—',
    },
    statusCol<PepRow>('Surveillance Status', '16%'),
    { key: 'action', label: 'Action', width: '12%', align: 'center', role: 'action', render: (r) => <ActionButton onClick={() => openRecord('pep', r, true)} label={`PEP details for ${r.fullName}`}>PEP Details</ActionButton> },
  ]

  const immColumns: Col<ImmunizationRow>[] = [
    { ...identityCol, width: '18%' },
    { ...departmentCol, width: '14%' },
    {
      key: 'record', label: 'Immunization Record', width: '24%', icon: headIcon(<Syringe size={17} aria-hidden="true" />),
      render: (r) => {
        if (!r.latest) return <span style={{ color: '#5f6b7d' }}>No dose on file</span>
        return (
          <>
            <strong style={{ fontWeight: 600 }}>{r.latest.vaccineType} — Dose {r.latest.dose}</strong>
            <div style={{ fontSize: 13, color: '#5f6b7d' }}>Given {isoDay(r.latest.administeredDate)}</div>
            {r.attention && <div style={{ fontSize: 13, fontWeight: 600, color: r.bucket === 'OVERDUE' ? '#b42318' : '#764000' }}>{r.attention.vaccineType.trim().toLowerCase() === r.latest.vaccineType.trim().toLowerCase() ? 'Next dose' : `${r.attention.vaccineType}: next dose`} {r.bucket === 'OVERDUE' ? 'overdue since' : 'due'} <span style={{ whiteSpace: 'nowrap' }}>{isoDay(r.attention.nextDueDate)}</span></div>}
          </>
        )
      },
    },
    { key: 'bcg', label: 'BCG / Vaccine Baseline', width: '16%', icon: headIcon(<FlaskConical size={17} aria-hidden="true" />), render: (r) => r.bcgDate ? `BCG on file · ${isoDay(r.bcgDate)}` : <span style={{ color: '#5f6b7d' }}>No BCG on file</span> },
    statusCol<ImmunizationRow>('Status', '16%'),
    { key: 'action', label: 'Update', width: '12%', align: 'center', role: 'action', render: (r) => <ActionButton onClick={() => openRecord('immunization', r, true)} label={`Update immunization log for ${r.fullName}`} tone="dark">Update Log</ActionButton> },
  ]

  const resetPage = () => setPage(0)
  const shared = { page, onPage: setPage }
  const passports = filterRows(ape.rows, search, tab === 'ape' ? status : 'ALL')

  return (
    <div className="sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12 sm:px-6 lg:px-[4vw]" style={{ paddingTop: 'clamp(0px, 2.3vw, 44px)', fontFamily: 'Poppins,sans-serif' }}>
      <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 18, padding: 'clamp(20px, 1.8vw, 30px) clamp(20px, 2vw, 34px) 0', boxShadow: '0 4px 8px rgba(15,23,42,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px 0 12px', borderRadius: 999, background: '#dff3e6', color: '#00522f', fontSize: 13, fontWeight: 600 }}>
            <FileText size={15} strokeWidth={2.4} aria-hidden="true" /> Centralized Health Registry
          </span>
          <button type="button" onClick={runScan} disabled={scanning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 18px', border: '1px solid #d5dce6', borderRadius: 999, background: '#fff', color: '#1f3151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.7 : 1 }}
          >
            <RefreshCw size={16} aria-hidden="true" /> {scanning ? 'Scanning…' : 'Run Compliance Scan'}
          </button>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.25, margin: '14px 0 0' }}>Occupational Health Screening Modules</h1>
        <p style={{ fontSize: 13, color: '#55667e', lineHeight: 1.5, margin: '4px 0 0' }}>Access and manage staff medical records across all four mandated health tracking modules. Switch tabs below to view detailed logs.</p>
        {scanMessage && <p role={scanMessage.ok ? 'status' : 'alert'} style={{ fontSize: 13, fontWeight: 600, color: scanMessage.ok ? '#00643a' : '#b42318', margin: '10px 0 0' }}>{scanMessage.text}</p>}
        <TabStrip active={tab} onChange={changeTab} />
      </motion.div>

      <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ marginTop: 22, background: '#fff', borderRadius: 18, padding: 'clamp(14px, 1.2vw, 20px)', boxShadow: '0 4px 8px rgba(15,23,42,0.14)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 0 }}>
          <label htmlFor={searchId} className="sr-only">Search staff by name, ID, or department</label>
          <Search size={18} color="#5f6b7d" aria-hidden="true" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)' }} />
          <input id={searchId} type="search" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); setPassportCount(PASSPORT_STEP) }} placeholder="Search staff name, ID, or department" autoComplete="off"
            className="outline-none placeholder:text-[#667085] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006042]"
            style={{ width: '100%', minHeight: 44, padding: '0 16px 0 46px', border: 'none', borderRadius: 12, background: '#f4f7fb', fontFamily: 'Poppins,sans-serif', fontSize: 13, color: '#1f3151' }}
          />
        </div>
        <div style={{ flex: '0 1 280px', minWidth: 220 }}><StatusSelect value={status} options={filters} onChange={(v) => { setStatus(v); resetPage(); setPassportCount(PASSPORT_STEP) }} /></div>
        <button type="button" onClick={() => openRecord(tab === 'ape' ? 'pre-employment' : tab, null, false, tab === 'ape' ? 'Annual physical exams are recorded when staff submit documents and you verify them under Document Verification, so they are not added here.' : undefined)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 44, padding: '0 22px', border: 'none', borderRadius: 12, background: GREEN, color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Plus size={20} aria-hidden="true" /> Add Health Record
        </button>
      </motion.div>

      <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" id="registry-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}
        style={{ marginTop: 22, background: '#fff', borderRadius: 16, border: '1px solid #e5e9f0', boxShadow: '0 4px 8px rgba(15,23,42,0.14)', overflow: 'hidden' }}
      >
        {tab === 'ape' && <RegistryList columns={apeColumns} rows={apeRows} caption="Annual physical exam status by staff member" loading={ape.loading} error={ape.error} onRetry={() => refresh('ape')} emptyText="No staff match your search." {...shared} />}
        {tab === 'pre-employment' && <RegistryList columns={preColumns} rows={preRows} caption="Pre-employment clearance by staff member" loading={pre.loading} error={pre.error} onRetry={() => refresh('pre-employment')} emptyText="No staff match your search." {...shared} />}
        {tab === 'pep' && <RegistryList columns={pepColumns} rows={pepRows} caption="Exposure (PEP) surveillance by staff member" loading={pep.loading} error={pep.error} onRetry={() => refresh('pep')} emptyText="No staff match your search." {...shared} />}
        {tab === 'immunization' && <RegistryList columns={immColumns} rows={immRows} caption="Immunization status by staff member" loading={imm.loading} error={imm.error} onRetry={() => refresh('immunization')} emptyText="No staff match your search." {...shared} />}
      </motion.div>

      <section aria-labelledby="passports-title" style={{ marginTop: 'clamp(24px, 2.4vw, 40px)', paddingTop: 'clamp(16px, 1.6vw, 26px)', borderTop: '1px solid #dfe5ec' }}>
        <h2 id="passports-title" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#1f2937' }}>
          <IdCard size={20} color={GREEN} aria-hidden="true" /> Personnel Digital Health Passport Cards
        </h2>
        {ape.error && <p role="alert" style={{ fontSize: 13, color: '#b42318', fontWeight: 600 }}>{ape.error}</p>}
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 'clamp(14px, 1.3vw, 22px)', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
          {passports.slice(0, passportCount).map((r, i) => <PassportCard key={r.id} row={r} index={i} onOpen={(row) => setModal({ type: 'cert', row })} />)}
        </ul>
        {!ape.loading && passports.length === 0 && !ape.error && <p style={{ fontSize: 14, color: '#5f6b7d', margin: '16px 0 0' }}>No staff match your search.</p>}
        {passports.length > passportCount && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 20 }}>
            <span style={{ fontSize: 13, color: '#55667e' }}>Showing {passportCount} of {passports.length}</span>
            <button type="button" onClick={() => setPassportCount((n) => n + PASSPORT_STEP)} style={{ minHeight: 44, padding: '0 20px', border: '1px solid #d5dce6', borderRadius: 10, background: '#fff', color: '#1f3151', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Show more</button>
          </div>
        )}
      </section>

      {modal?.type === 'cert' && <CertificateModal row={modal.row} onClose={() => setModal(null)} />}
      {modal?.type === 'print-pre' && <PreEmploymentPrintModal row={modal.row} printedBy={printedBy} onClose={() => setModal(null)} />}
      {modal?.type === 'record' && (
        <RecordModal key={`${modal.kind}-${modal.person?.id ?? 'new'}`} initialKind={modal.kind} lockKind={modal.lock} person={modal.person} people={people} note={modal.note} onClose={() => setModal(null)}
          onChanged={(kind) => refresh(kind === 'immunization' ? 'immunization' : kind === 'pep' ? 'pep' : 'pre-employment')}
        />
      )}
    </div>
  )
}
