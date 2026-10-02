'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, ShieldAlert, Check } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { getPreciseRole } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { toCsv } from '@/lib/format'

interface PiiRow {
  employeeId: string
  fullName: string
  employmentType: 'PERMANENT' | 'COS'
  department: string
  jobTitle: string | null
  email: string
  phone: string | null
  birthDate: string
  role: string
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow — please try again.'
  return fallback
}

const employmentTypeBadge = (type: PiiRow['employmentType']) =>
  type === 'PERMANENT'
    ? { bg: '#ebf8ff', color: '#2b6cb0', label: 'PERMANENT' }
    : { bg: '#faf5ff', color: '#805ad5', label: 'COS' }

export default function PiiIndex() {
  const [preciseRole, setPreciseRole] = useState<ReturnType<typeof getPreciseRole>>(null)
  const [rows, setRows] = useState<PiiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  useEffect(() => {
    setPreciseRole(getPreciseRole())
  }, [])

  useEffect(() => {
    if (preciseRole !== 'ADMIN') return
    setLoading(true)
    setError('')
    api
      .get<PiiRow[]>('/reports/pii-index')
      .then(setRows)
      .catch((err) => setError(apiErrorMessage(err, 'Could not load the PII information index.')))
      .finally(() => setLoading(false))
  }, [preciseRole])

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return r.fullName.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)
  })

  const handleExport = () => {
    setExporting(true)
    try {
      const csv = toCsv(filtered.map((r) => ({
        'Employee ID': r.employeeId,
        'Full Name': r.fullName,
        'Employment Type': r.employmentType,
        Department: r.department,
        'Job Title': r.jobTitle ?? '',
        Email: r.email,
        Phone: r.phone ?? '',
        'Birth Date': r.birthDate,
        Role: r.role,
      })))
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'PII_Information_Index.csv'
      a.click()
      URL.revokeObjectURL(url)
      setExported(true)
      setTimeout(() => setExported(false), 2200)
    } finally {
      setExporting(false)
    }
  }

  if (preciseRole !== null && preciseRole !== 'ADMIN') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <ShieldAlert size={40} color="#a0aec0" style={{ marginBottom: 16 }} />
        <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 800, color: '#1f3151', marginBottom: 8 }}>Admin access only</div>
        <p style={{ fontSize: 13, color: '#718096', maxWidth: 360 }}>The PII Information Index contains sensitive personal data restricted to hospital administrators.</p>
      </div>
    )
  }

  const columns: { key: keyof PiiRow; label: string }[] = [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'fullName', label: 'Full Name' },
    { key: 'department', label: 'Department' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'birthDate', label: 'Birth Date' },
  ]

  return (
    <div>
      <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" className="flex flex-col sm:flex-row sm:justify-between sm:items-start" style={{ gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>PII Information Index</h1>
          <p style={{ fontSize: 13, color: '#718096', margin: 0 }}>Hospital-wide personal-data registry — Employee ID, contact details, and employment type per Data Privacy Act (RA 10173) recordkeeping.</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || filtered.length === 0}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#111827', border: 'none', borderRadius: 999, padding: '10px 18px', minHeight: 44, cursor: exporting ? 'default' : 'pointer', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0, opacity: filtered.length === 0 ? 0.6 : 1 }}
        >
          {exported ? <Check size={14} /> : <Download size={14} />} {exported ? 'Exported' : 'Export CSV'}
        </button>
      </motion.div>

      <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} color="#a0aec0" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, Employee ID, or department..."
          style={{ width: '100%', padding: '13px 16px 13px 42px', border: '1px solid #e2e8f0', borderRadius: 999, fontSize: 13, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
        />
      </motion.div>

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ textAlign: 'center', padding: '20px 0', color: '#c53030', fontSize: 12, fontWeight: 700 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Mobile-native card list */}
          <div className="sm:hidden">
            {filtered.map((r, i) => {
              const badge = employmentTypeBadge(r.employmentType)
              return (
                <motion.div key={r.employeeId} custom={i + 2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 800, color: '#1f3151' }}>{r.fullName}</div>
                      <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>{r.employeeId} • {r.department}</div>
                    </div>
                    <span style={{ background: badge.bg, color: badge.color, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{badge.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.7 }}>
                    {r.jobTitle && <div>{r.jobTitle}</div>}
                    <div>{r.email}</div>
                    {r.phone && <div>{r.phone}</div>}
                    <div>Born {r.birthDate}</div>
                  </div>
                </motion.div>
              )
            })}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>No matching employees.</div>}
          </div>

          {/* Tablet / desktop table */}
          <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" className="hidden sm:block" style={{ background: '#fff', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1.2fr 0.9fr 0.9fr 1.2fr 110px 100px 100px', gap: 12, padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {columns.map((c) => (
                <div key={c.key} style={{ fontSize: 11, fontWeight: 800, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
              ))}
              <div style={{ fontSize: 11, fontWeight: 800, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</div>
            </div>
            {filtered.map((r) => {
              const badge = employmentTypeBadge(r.employmentType)
              return (
                <div key={r.employeeId} style={{ display: 'grid', gridTemplateColumns: '100px 1.2fr 0.9fr 0.9fr 1.2fr 110px 100px 100px', gap: 12, padding: '14px 20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#4a5568', fontWeight: 700 }}>{r.employeeId}</div>
                  <div style={{ fontSize: 13, color: '#1f3151', fontWeight: 700 }}>{r.fullName}</div>
                  <div style={{ fontSize: 12, color: '#4a5568' }}>{r.department}</div>
                  <div style={{ fontSize: 12, color: '#4a5568' }}>{r.jobTitle ?? '—'}</div>
                  <div style={{ fontSize: 12, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
                  <div style={{ fontSize: 12, color: '#4a5568' }}>{r.phone ?? '—'}</div>
                  <div style={{ fontSize: 12, color: '#4a5568' }}>{r.birthDate}</div>
                  <span style={{ background: badge.bg, color: badge.color, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, textAlign: 'center', width: 'fit-content' }}>{badge.label}</span>
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: '#a0aec0', fontSize: 13 }}>No matching employees.</div>}
          </motion.div>
        </>
      )}
    </div>
  )
}
