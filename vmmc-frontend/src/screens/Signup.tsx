'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, BriefcaseBusiness, Building2, CheckCircle2 } from 'lucide-react'
import VmmcSeal from '@/components/VmmcSeal'
import { api, ApiError, ApiConnectionError } from '@/lib/api'

const employeeIdHelp = {
  PERMANENT: 'Format: VMMC-YY-NNNN (example: VMMC-25-0021)',
  COS: 'Format: VMMC-COS-YY-NNNN (example: VMMC-COS-25-1001)',
}

export default function Signup() {
  const router = useRouter()
  const [employmentType, setEmploymentType] = useState<'PERMANENT' | 'COS'>('PERMANENT')
  const [employeeId, setEmployeeId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [apiError, setApiError] = useState('')

  const handleSignup = async () => {
    setApiError('')
    const trimmed = employeeId.trim()
    if (!trimmed) {
      setApiError('Please enter your Employee ID.')
      return
    }
    if (submitting) return

    setSubmitting(true)
    try {
      await api.post('/auth/signup', {
        employeeId: trimmed,
        employmentType,
      })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message || 'Unable to create the account.')
      } else if (err instanceof ApiConnectionError) {
        setApiError('Connection is slow or unavailable. Please try again.')
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const backButton = (
    <button onClick={() => router.push('/login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151', fontWeight: 700, padding: 0, minHeight: 44, marginBottom: 18 }}>
      <ArrowLeft size={16} />
      Back to sign in
    </button>
  )

  const employmentTypeSelector = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
      <button
        onClick={() => setEmploymentType('PERMANENT')}
        style={{
          border: employmentType === 'PERMANENT' ? '2px solid #008d46' : '1px solid #e2e8f0',
          background: employmentType === 'PERMANENT' ? '#e6f9ee' : '#fff',
          borderRadius: 14,
          padding: '18px 14px',
          cursor: 'pointer',
          color: '#1f3151',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Building2 size={18} color={employmentType === 'PERMANENT' ? '#008d46' : '#1f3151'} />
          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700 }}>Permanent Staff</span>
        </div>
        <div style={{ fontSize: 12, color: '#4a5568' }}>VMMC-YY-NNNN</div>
      </button>

      <button
        onClick={() => setEmploymentType('COS')}
        style={{
          border: employmentType === 'COS' ? '2px solid #008d46' : '1px solid #e2e8f0',
          background: employmentType === 'COS' ? '#e6f9ee' : '#fff',
          borderRadius: 14,
          padding: '18px 14px',
          cursor: 'pointer',
          color: '#1f3151',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BriefcaseBusiness size={18} color={employmentType === 'COS' ? '#008d46' : '#1f3151'} />
          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700 }}>COS Staff</span>
        </div>
        <div style={{ fontSize: 12, color: '#4a5568' }}>VMMC-COS-YY-NNNN</div>
      </button>
    </div>
  )

  const employeeIdField = (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 6 }}>Employee ID</label>
      <input
        value={employeeId}
        onChange={e => setEmployeeId(e.target.value.toUpperCase())}
        placeholder={employmentType === 'PERMANENT' ? 'VMMC-25-0021' : 'VMMC-COS-25-1001'}
        style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: 12, color: '#718096', marginTop: 8 }}>{employeeIdHelp[employmentType]}</div>
    </div>
  )

  const errorMessage = apiError && (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 12, fontWeight: 700, color: '#c53030', marginBottom: 16, textAlign: 'center' }}>
      {apiError}
    </motion.p>
  )

  const submitButton = (
    <button onClick={handleSignup} disabled={submitting} style={{ width: '100%', padding: '15px 0', minHeight: 44, borderRadius: 12, border: 'none', cursor: submitting ? 'default' : 'pointer', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700 }}>
      {submitting ? 'Creating account…' : 'Create account'}
    </button>
  )

  const doneView = (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <CheckCircle2 size={52} color="#008d46" />
      </div>
      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151' }}>Account ready</div>
      <div style={{ fontSize: 14, color: '#4a5568', lineHeight: 1.7, marginTop: 12 }}>
        Your account has been created with the default password <strong>password123</strong>.<br />
        You will be required to change it on your first login.
      </div>
      <button onClick={() => router.push('/login')} style={{ width: '100%', marginTop: 18, padding: '15px 0', minHeight: 44, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700 }}>
        Go to sign in
      </button>
    </motion.div>
  )

  const formBody = !done ? (
    <>
      {employmentTypeSelector}
      {employeeIdField}
      {errorMessage}
      {submitButton}
    </>
  ) : doneView

  return (
    <>
      {/* Mobile-native signup (phones, < sm) — matches Login.tsx/ForgotPassword.tsx's mobile treatment: no floating card, seal + wordmark directly on the gradient background. */}
      <div
        className="flex sm:hidden"
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #a9bce2 0%, #eef3f2 45%, #c6e8d2 100%)',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '56px 24px 40px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          {backButton}

          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <VmmcSeal size={88} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 18 }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 24, color: '#1f3151', letterSpacing: '-0.02em' }}>VMMC</span>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 24, color: '#3a7d44', letterSpacing: '-0.02em' }}>TRACKER</span>
            </div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 20, fontWeight: 800, color: '#1f3151', textAlign: 'center', marginTop: 20 }}>Create your account</div>
            <div style={{ fontSize: 13, color: '#4a5568', marginTop: 8, lineHeight: 1.6, textAlign: 'center' }}>
              Complete your employee setup using your official VMMC employee ID.
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} style={{ marginTop: 28 }}>
            {formBody}
          </motion.div>
        </div>
      </div>

      {/* Tablet / desktop signup — floating card design, unchanged from before this pass. */}
      <div className="hidden sm:flex" style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #edf5f2 0%, #ffffff 45%, #f8fafc 100%)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', padding: 32 }}>
          {backButton}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <VmmcSeal size={86} />
          </div>

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 28, fontWeight: 800, color: '#1f3151' }}>Create your account</div>
            <div style={{ fontSize: 13, color: '#4a5568', marginTop: 8, lineHeight: 1.6 }}>
              Complete your employee setup using your official VMMC employee ID.
            </div>
          </div>

          {formBody}
        </motion.div>
      </div>
    </>
  )
}
