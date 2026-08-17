'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import VmmcSeal from '@/components/VmmcSeal'
import { fadeRise } from '@/lib/motion'
import { login, type AuthSession } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'

export default function Login() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'staff' | 'admin'>('staff')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')

  const missingFields = !employeeId.trim() || !password.trim()

  const handleLogin = async () => {
    setAttempted(true)
    setApiError('')
    if (missingFields || submitting) return

    setSubmitting(true)
    try {
      const session = await api.post<AuthSession>('/auth/login', {
        employeeId: employeeId.trim(),
        password,
        portal: activeTab,
      })
      login(session)
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message || 'Invalid Employee ID or password.')
      } else if (err instanceof ApiConnectionError) {
        setApiError('Connection is slow or unavailable. Please try again.')
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const tabRow = (
    <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
      <button
        onClick={() => setActiveTab('staff')}
        style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: activeTab === 'staff' ? 'linear-gradient(to right, #1f3151 0%, #1c4b4f 100%)' : '#f8fafc', color: activeTab === 'staff' ? '#fff' : '#a0aec0', transition: 'all 0.2s' }}
      >
        Staff Login
      </button>
      <button
        onClick={() => setActiveTab('admin')}
        style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: activeTab === 'admin' ? 'linear-gradient(to right, #1f3151 0%, #1c4b4f 100%)' : '#f8fafc', color: activeTab === 'admin' ? '#fff' : '#a0aec0', transition: 'all 0.2s' }}
      >
        Admin Login
      </button>
    </div>
  )

  const employeeIdField = (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Employee ID</label>
      <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="Enter ID number"
        style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
        onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
      />
    </div>
  )

  const passwordField = (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Password</label>
      <div style={{ position: 'relative' }}>
        <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password"
          style={{ width: '100%', padding: '14px 40px 14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
          onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
        />
        <button onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151', padding: 0 }}>
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )

  const rememberRow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#1f3151' }}>
        <div style={{ width: 14, height: 14, borderRadius: 4, background: remember ? '#008d46' : '#fff', border: remember ? 'none' : '1px solid #cbd5e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {remember && <svg width="9" height="7" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ display: 'none' }} />
        Remember Me
      </label>
      <button onClick={() => router.push('/forgot-password')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 10, fontWeight: 700, textDecoration: 'underline' }}>Forgot Password?</button>
    </div>
  )

  const loginError = attempted && (missingFields || apiError) && (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', textAlign: 'center', marginBottom: 20, marginTop: -12 }}>
      {missingFields ? 'Please enter both your Employee ID and Password.' : apiError}
    </motion.p>
  )

  const loginButton = (
    <motion.button
      onClick={handleLogin}
      whileHover={submitting ? undefined : { scale: 1.02, filter: 'brightness(1.05)' }}
      whileTap={submitting ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
      disabled={submitting}
      style={{ width: '100%', padding: '14px 0', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', marginBottom: 28, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', opacity: submitting ? 0.75 : 1 }}
    >
      <AnimatePresence mode="wait">
        <motion.span key={submitting ? 'submitting' : activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {submitting ? 'Logging in…' : `Log in as ${activeTab === 'staff' ? 'Staff' : 'Admin'}`}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )

  const finePrint = (
    <>
      <p style={{ fontSize: 10, color: '#4a5568', textAlign: 'center', marginBottom: 32, lineHeight: 1.6, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        BY LOGGING IN, YOU AGREE TO THE<br/>
        <span style={{ fontWeight: 800, color: '#1f3151', cursor: 'pointer' }}>TERMS OF SERVICE</span>
        {' '}AND{' '}
        <span style={{ fontWeight: 800, color: '#1f3151', cursor: 'pointer' }}>PRIVACY POLICY</span>
      </p>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#3a7d44', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AUTHORIZED ACCESS ONLY</span>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile-native login (phones, < sm) — distinct layout, not a reflow of the desktop card */}
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
            <VmmcSeal size={104} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 20 }}>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: '#1f3151', letterSpacing: '-0.02em' }}>VMMC</span>
              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: '#3a7d44', letterSpacing: '-0.02em' }}>TRACKER</span>
            </div>
            <div style={{ fontSize: 11, color: '#718096', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginTop: 6, textAlign: 'center' }}>
              TB DOTS &amp; X-RAY COMPLIANCE
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1f3151', textAlign: 'center', lineHeight: 1.5, marginTop: 28 }}>
              Welcome to<br />VMMC TB DOTS Health Management
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} style={{ marginTop: 32 }}>
            {tabRow}
            {employeeIdField}
            {passwordField}
            {rememberRow}
            {loginError}
            {loginButton}
            {finePrint}
          </motion.div>
        </div>
      </div>

      {/* Tablet / desktop login */}
      <div className="hidden sm:flex" style={{ flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
        <header className="px-4 sm:px-6" style={{ background: '#1c2538', height: 68, display: 'flex', alignItems: 'center', flexShrink: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <VmmcSeal size={42} />
            <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1.1 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 19, fontWeight: 800, color: '#4ade80', letterSpacing: '0.02em' }}>VMMC</span>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>SURVEILLANCE</span>
              </div>
              <div style={{ fontSize: 10, color: '#e2e8f0', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 4, fontWeight: 600 }}>
                TB DOTS &amp; PULMONARY COMPLIANCE REGISTRY
              </div>
            </div>
          </div>
          <div className="hidden md:block" style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Veterans Memorial Medical Center</div>
            <div style={{ color: '#4ade80', fontSize: 11, fontWeight: 500, marginTop: 4 }}>Staff Personal Surveillance Dashboard</div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row" style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 90% 40%, rgba(160, 210, 180, 0.45) 0%, rgba(255, 255, 255, 0) 50%), radial-gradient(circle at 10% 90%, rgba(180, 215, 245, 0.6) 0%, rgba(255, 255, 255, 0) 50%), #ffffff', zIndex: 0 }} />

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:flex-[0_0_60%] px-10 lg:px-20 lg:py-0"
            style={{ display: 'flex', flexDirection: 'column', zIndex: 1, paddingTop: 40, paddingBottom: 40 }}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', paddingBottom: 40 }}>
              <motion.div className="gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
                <VmmcSeal size={140} className="sm:!w-28 sm:!h-28 lg:!w-[140px] lg:!h-[140px]" />
                <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ textAlign: 'left' }}>
                  <div className="flex sm:items-baseline gap-2.5" style={{ marginBottom: 4 }}>
                    <span className="text-[44px] lg:text-[56px]" style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, color: '#1f3151', letterSpacing: '-0.02em' }}>VMMC</span>
                    <span className="text-[44px] lg:text-[56px]" style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, color: '#3a7d44', letterSpacing: '-0.02em' }}>TRACKER</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#1f3151', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
                    TB DOTS &amp; X-RAY COMPLIANCE MANAGEMENT SYSTEM
                  </div>
                </motion.div>
              </motion.div>
              <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ maxWidth: 540, textAlign: 'left' }}>
                <h2 className="text-[23px] lg:text-[26px]" style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, color: '#1f3151', marginBottom: 20, lineHeight: 1.3 }}>
                  Secure Hospital-wide Clinical Screening &amp; Surveillance Portal
                </h2>
                <p style={{ fontSize: 16, color: '#4a5568', lineHeight: 1.8 }}>
                  Designed exclusively for the clinicians, laboratory technicians, and administrators of the Veterans Memorial Medical Center. Securely monitor and review employee pulmonary compliance clearances, upload diagnostic X-Rays, and coordinate follow-up molecular testing loops instantly.
                </p>
              </motion.div>
            </div>

            <div className="hidden lg:flex" style={{ position: 'absolute', bottom: 32, left: 80, gap: 64, fontSize: 11, color: '#a0aec0', opacity: 0.8, whiteSpace: 'nowrap' }}>
              <span style={{ letterSpacing: '0.02em' }}>Veterans Memorial Medical Center • Department of Health</span>
              <span style={{ letterSpacing: '0.02em' }}>Data Privacy Compliant (RA 10173) • Intranet Code Active</span>
            </div>
          </motion.div>

          <div className="w-full lg:flex-1 px-10 lg:px-20 lg:py-0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, paddingTop: 40, paddingBottom: 40 }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="px-10 py-12"
              style={{ background: '#fff', borderRadius: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)', width: '100%', maxWidth: 400 }}
            >
              <h2 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>Log In</h2>
              <p style={{ fontSize: 12, color: '#718096', marginBottom: 28, lineHeight: 1.6 }}>
                Input your secure credentials below to enter the active pulmonary compliance registry.
              </p>

              {tabRow}
              {employeeIdField}
              {passwordField}
              {rememberRow}
              {loginError}
              {loginButton}
              {finePrint}
            </motion.div>
          </div>
        </div>
      </div>
    </>
  )
}
