'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import VmmcSeal from '@/components/VmmcSeal'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { getUser, logout, setPasswordChangeRequired } from '@/lib/auth'

export default function FirstLoginReset() {
  const router = useRouter()
  const user = getUser()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')

  const onSubmit = async () => {
    setApiError('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setApiError('Please fill in all password fields.')
      return
    }
    if (newPassword.length < 8) {
      setApiError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setApiError('New password and confirmation do not match.')
      return
    }
    if (submitting) return

    setSubmitting(true)
    try {
      await api.post('/auth/first-login/change-password', {
        employeeId: user?.employeeId,
        currentPassword,
        newPassword,
      })
      setPasswordChangeRequired(false)
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message || 'Could not update your password.')
      } else if (err instanceof ApiConnectionError) {
        setApiError('Connection is slow or unavailable. Please try again.')
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const passwordFields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 6 }}>Current Password</label>
        <div style={{ position: 'relative' }}>
          <input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter your current password"
            style={{ width: '100%', padding: '14px 40px 14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          <button type="button" onClick={() => setShowCurrent(v => !v)} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151' }}>
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 6 }}>New Password</label>
        <div style={{ position: 'relative' }}>
          <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Create a new password"
            style={{ width: '100%', padding: '14px 40px 14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151' }}>
            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1f3151', marginBottom: 6 }}>Confirm New Password</label>
        <div style={{ position: 'relative' }}>
          <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password"
            style={{ width: '100%', padding: '14px 40px 14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151' }}>
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </div>
  )

  const errorMessage = apiError && (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 12, fontWeight: 700, color: '#c53030', marginTop: 18, marginBottom: 0, textAlign: 'center' }}>
      {apiError}
    </motion.p>
  )

  const submitButton = (
    <button onClick={onSubmit} disabled={submitting} style={{ width: '100%', marginTop: 22, padding: '15px 0', minHeight: 44, borderRadius: 12, border: 'none', cursor: submitting ? 'default' : 'pointer', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700 }}>
      {submitting ? 'Updating…' : 'Update Password'}
    </button>
  )

  const secureNotice = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, color: '#718096', fontSize: 12 }}>
      <ShieldCheck size={15} color="#008d46" />
      Secure password reset required for first-time access
    </div>
  )

  const logoutButton = (
    <button onClick={handleLogout} style={{ width: '100%', marginTop: 16, padding: '12px 0', minHeight: 44, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#1f3151', fontWeight: 700 }}>
      Log out
    </button>
  )

  return (
    <>
      {/* Mobile-native first-login reset (phones, < sm) — matches Login.tsx/Signup.tsx's mobile treatment: no floating card, seal + wordmark directly on the gradient background. */}
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
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <VmmcSeal size={80} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 18 }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 24, color: '#1f3151', letterSpacing: '-0.02em' }}>VMMC</span>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 24, color: '#3a7d44', letterSpacing: '-0.02em' }}>TRACKER</span>
            </div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 20, fontWeight: 800, color: '#1f3151', textAlign: 'center', marginTop: 20 }}>Password Change Required</div>
            <div style={{ fontSize: 13, color: '#4a5568', marginTop: 8, lineHeight: 1.6, textAlign: 'center' }}>
              This is your first sign-in. Please set a new password to continue.
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} style={{ marginTop: 28 }}>
            {passwordFields}
            {errorMessage}
            {submitButton}
            {secureNotice}
            {logoutButton}
          </motion.div>
        </div>
      </div>

      {/* Tablet / desktop first-login reset — floating card design, unchanged from before this pass. */}
      <div className="hidden sm:flex" style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #eef3f2 0%, #f8fafc 100%)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', padding: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <VmmcSeal size={72} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 23, fontWeight: 800, color: '#1f3151', fontFamily: 'Poppins,sans-serif' }}>Password Change Required</div>
            <div style={{ fontSize: 13, color: '#4a5568', marginTop: 8, lineHeight: 1.6 }}>
              This is your first sign-in. Please set a new password to continue.
            </div>
          </div>

          {passwordFields}
          {errorMessage}
          {submitButton}
          {secureNotice}
          {logoutButton}
        </motion.div>
      </div>
    </>
  )
}
