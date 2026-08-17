'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronLeft, BadgeCheck } from 'lucide-react'
import VmmcSeal from '@/components/VmmcSeal'
import { fadeRise } from '@/lib/motion'
import { api, ApiError, ApiConnectionError } from '@/lib/api'

const PH_MOBILE_LENGTH = 11

function isPhoneAttempt(value: string) {
  return /^\d/.test(value.trim())
}

/** Deliberately avoids a single greedy local@domain.tld regex (backtracking risk) —
 * checks the "@" and "." shape with plain string ops instead. */
function isValidEmail(value: string) {
  if (/\s/.test(value)) return false
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@')) return false
  const domain = value.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1
}

function maskContact(value: string) {
  const trimmed = value.trim()
  if (!isPhoneAttempt(trimmed)) {
    const [user, domain] = trimmed.split('@')
    const visible = user.slice(0, 2)
    return `${visible}${'•'.repeat(Math.max(user.length - 2, 3))}@${domain}`
  }
  const digits = trimmed.replace(/\s+/g, '')
  if (digits.length <= 7) return digits
  return `${digits.slice(0, 5)}${'•'.repeat(5)}${digits.slice(-3)}`
}

/** Contact field only accepts free text until the first character typed is a
 * digit, at which point it's treated as a PH mobile number attempt: digits only,
 * capped at 11 (e.g. 09171234567) since that's the local PH mobile format. */
function sanitizeContactInput(raw: string) {
  if (isPhoneAttempt(raw)) return raw.replace(/\D/g, '').slice(0, PH_MOBILE_LENGTH)
  return raw
}

function contactValidationError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'Please enter your email or phone number.'
  if (isPhoneAttempt(trimmed)) {
    return trimmed.length === PH_MOBILE_LENGTH ? '' : `Please enter a valid ${PH_MOBILE_LENGTH}-digit Philippine mobile number.`
  }
  return isValidEmail(trimmed) ? '' : 'Please enter a valid email address.'
}

function OtpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...value]
    next[i] = digit
    onChange(next)
    if (digit && i < 5) refs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          inputMode="numeric"
          maxLength={1}
          style={{ width: 44, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#1f3151', border: '1px solid #e2e8f0', borderRadius: 10, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}
          onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
        />
      ))}
    </div>
  )
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow or unavailable. Please try again.'
  return fallback
}

export default function ForgotPassword() {
  const router = useRouter()
  const [step, setStep] = useState<'request' | 'verify' | 'reset'>('request')
  const [contact, setContact] = useState('')
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', ''])
  const [resent, setResent] = useState(false)
  const [contactAttempted, setContactAttempted] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetAttempted, setResetAttempted] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetApiError, setResetApiError] = useState('')

  const maskedContact = maskContact(contact)
  const verifyTitle = isPhoneAttempt(contact) ? 'Check your SMS' : 'Check your Email'
  const contactError = contactValidationError(contact)

  const resetErrorMessage = !newPassword || !confirmPassword
    ? '*Please enter and confirm your new password.'
    : newPassword !== confirmPassword
      ? '*Password does not match.'
      : newPassword.length < 8
        ? '*Password must be at least 8 characters.'
        : resetApiError
          ? `*${resetApiError}`
          : ''

  const handleContactChange = (raw: string) => {
    setContact(sanitizeContactInput(raw))
  }

  const handleConfirm = async () => {
    setContactAttempted(true)
    if (contactError || submitting) return
    setSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { contact: contact.trim() })
      setStep('verify')
    } catch {
      // The endpoint always returns a generic success response — a thrown error here
      // means the request itself failed (network/timeout), not an invalid contact.
      setOtpError('')
      setStep('verify')
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerify = async () => {
    if (otp.some(d => !d) || submitting) return
    setOtpError('')
    setSubmitting(true)
    try {
      const { resetToken } = await api.post<{ resetToken: string }>('/auth/verify-otp', {
        contact: contact.trim(),
        otp: otp.join(''),
      })
      setResetToken(resetToken)
      setStep('reset')
    } catch (err) {
      setOtpError(apiErrorMessage(err, 'Invalid or expired code.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (submitting) return
    try {
      await api.post('/auth/forgot-password', { contact: contact.trim() })
    } catch {
      // Best-effort resend — the OTP screen doesn't surface transport errors here.
    }
    setResent(true)
    setTimeout(() => setResent(false), 2500)
  }

  const handleResetPassword = async () => {
    setResetAttempted(true)
    setResetApiError('')
    if (!newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8) return
    if (submitting) return
    setSubmitting(true)
    try {
      await api.post('/auth/reset-password', { resetToken, newPassword })
      setResetSuccess(true)
    } catch (err) {
      setResetApiError(apiErrorMessage(err, 'Could not reset password. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const contactErrorNote = contactAttempted && contactError && (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginTop: -12, marginBottom: 20 }}>
      {contactError}
    </motion.p>
  )

  const otpErrorNote = otpError && (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', textAlign: 'center', marginTop: 16 }}>
      {otpError}
    </motion.p>
  )

  const resetErrorNote = resetAttempted && resetErrorMessage && (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 16 }}>
      {resetErrorMessage}
    </motion.p>
  )

  const confirmButton = (
    <motion.button
      onClick={handleConfirm}
      whileHover={submitting ? undefined : { scale: 1.02, filter: 'brightness(1.05)' }}
      whileTap={submitting ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
      disabled={submitting}
      style={{ width: '100%', padding: '14px 0', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', opacity: submitting ? 0.75 : 1 }}
    >
      {submitting ? 'Sending…' : 'Confirm'}
    </motion.button>
  )

  const verifyButton = (
    <motion.button
      onClick={handleVerify}
      whileHover={submitting ? undefined : { scale: 1.02, filter: 'brightness(1.05)' }}
      whileTap={submitting ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
      disabled={submitting}
      style={{ width: '100%', padding: '14px 0', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', opacity: submitting ? 0.75 : 1 }}
    >
      {submitting ? 'Verifying…' : 'Verify Code'}
    </motion.button>
  )

  const resetButton = (
    <motion.button
      onClick={handleResetPassword}
      whileHover={submitting ? undefined : { scale: 1.02, filter: 'brightness(1.05)' }}
      whileTap={submitting ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
      disabled={submitting}
      style={{ width: '100%', padding: '14px 0', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', opacity: submitting ? 0.75 : 1 }}
    >
      {submitting ? 'Confirming…' : 'Confirm'}
    </motion.button>
  )

  const resendRow = (
    <div style={{ textAlign: 'center', marginTop: 20 }}>
      <span style={{ fontSize: 11, color: '#a0aec0' }}>Didn&apos;t receive the code? </span>
      <button onClick={handleResend} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 11, fontWeight: 700, textDecoration: 'underline' }}>Resend</button>
      {resent && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 11, fontWeight: 700, color: '#008d46', marginTop: 8 }}>
          Code resent!
        </motion.p>
      )}
    </div>
  )

  const resetSuccessPanel = (
    <div style={{ textAlign: 'center', marginTop: 68 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <BadgeCheck size={72} color="#fff" fill="#008d46" strokeWidth={1.5} style={{ filter: 'drop-shadow(0 8px 16px rgba(0,141,70,0.3))' }} />
      </div>
      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 700, color: '#1f3151', marginBottom: 8 }}>Successful</div>
      <p style={{ fontSize: 12, color: '#718096', marginBottom: 32, lineHeight: 1.6, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
        Congratulations! Your password has been changed. Click confirm to login
      </p>
      <motion.button
        onClick={() => router.push('/login')}
        whileHover={{ scale: 1.02, filter: 'brightness(1.05)' }}
        whileTap={{ scale: 0.98 }}
        style={{ width: '100%', padding: '14px 0', background: 'linear-gradient(to right, #1f3151 0%, #29476b 40%, #0c4f38 75%, #00703f 100%)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
      >
        Confirm
      </motion.button>
    </div>
  )

  return (
    <>
      {/* Mobile-native forgot password (phones, < sm) */}
      <div className="flex sm:hidden" style={{ minHeight: '100vh', background: step === 'reset' && resetSuccess ? 'linear-gradient(180deg, #a9bce2 0%, #eef3f2 45%, #c6e8d2 100%)' : '#f4f7f6', flexDirection: 'column', padding: '20px 24px 40px', transition: 'background 0.3s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 32px', alignItems: 'center' }}>
          <button
            onClick={() => {
              if (step === 'reset' && resetSuccess) router.push('/login')
              else if (step === 'request') router.push('/login')
              else if (step === 'verify') setStep('request')
              else setStep('verify')
            }}
            aria-label="Go back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151', padding: 4, display: 'flex' }}
          >
            <ChevronLeft size={20} />
          </button>
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 17, fontWeight: 700, color: '#1f3151', textAlign: 'center', margin: 0 }}>
            {step === 'verify' ? verifyTitle : 'Forgot Password'}
          </h1>
          <div />
        </div>

        {step === 'request' && (
          <>
            <p style={{ fontSize: 11, color: '#a0aec0', textAlign: 'center', marginTop: 6, marginBottom: 44 }}>
              Please enter your email to reset your password.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1f3151', marginBottom: 8 }}>Email Address or Phone Number</label>
              <input
                value={contact}
                onChange={e => handleContactChange(e.target.value)}
                placeholder="Email or Phone Number"
                inputMode={isPhoneAttempt(contact) ? 'numeric' : 'email'}
                style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box', background: '#fff', marginBottom: 24 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
              />
              {contactErrorNote}
              {confirmButton}
            </div>
          </>
        )}

        {step === 'verify' && (
          <>
            <p style={{ fontSize: 11, color: '#a0aec0', textAlign: 'center', marginTop: 6, marginBottom: 40, lineHeight: 1.6 }}>
              We sent a reset link to {maskedContact}. Enter the 6 digit code mentioned in the text.
            </p>
            <div>
              <OtpInput value={otp} onChange={setOtp} />
              {otpErrorNote}
              <div style={{ marginTop: 28 }}>{verifyButton}</div>
              {resendRow}
            </div>
          </>
        )}

        {step === 'reset' && (
          resetSuccess ? resetSuccessPanel : (
            <>
              <div style={{ marginTop: 20, marginBottom: 6 }}>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 700, color: '#1f3151' }}>Set a new password</span>
              </div>
              <p style={{ fontSize: 11, color: '#a0aec0', marginBottom: 28, lineHeight: 1.6 }}>
                Create a new password. Ensure it differs from previous ones for security
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1f3151', marginBottom: 8 }}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box', background: '#fff' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1f3151', marginBottom: 8 }}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box', background: '#fff' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                />
              </div>
              {resetErrorNote}
              <div style={{ marginTop: 8 }}>{resetButton}</div>
            </>
          )
        )}
      </div>

      {/* Tablet / desktop forgot password — same shell as Login for consistency */}
      <div className="hidden sm:flex" style={{ flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
        <header className="px-8 lg:px-12" style={{ background: '#1c2538', height: 68, display: 'flex', alignItems: 'center', flexShrink: 0, zIndex: 10 }}>
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
              {step === 'request' && (
                <>
                  <button
                    onClick={() => router.push('/login')}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 20 }}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} /> Back to Login
                  </button>

                  <h2 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>Forgot Password</h2>
                  <p style={{ fontSize: 12, color: '#718096', marginBottom: 28, lineHeight: 1.6 }}>
                    Enter the email address or phone number associated with your account and we&apos;ll send you instructions to reset your password.
                  </p>

                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Email Address or Phone Number</label>
                    <input
                      value={contact}
                      onChange={e => handleContactChange(e.target.value)}
                      placeholder="Enter email or phone number"
                      inputMode={isPhoneAttempt(contact) ? 'numeric' : 'email'}
                      style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                    />
                  </div>
                  {contactErrorNote}

                  {confirmButton}

                  <div style={{ textAlign: 'center', marginTop: 28 }}>
                    <span style={{ fontSize: 11, color: '#718096' }}>
                      Remember your password?{' '}
                      <button onClick={() => router.push('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 11, fontWeight: 700, padding: 0, textDecoration: 'underline' }}>
                        Log In
                      </button>
                    </span>
                  </div>
                </>
              )}

              {step === 'verify' && (
                <>
                  <button
                    onClick={() => setStep('request')}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 20 }}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} /> Back
                  </button>

                  <h2 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 6, textAlign: 'center' }}>{verifyTitle}</h2>
                  <p style={{ fontSize: 12, color: '#718096', marginBottom: 32, lineHeight: 1.6, textAlign: 'center' }}>
                    We sent a reset link to {maskedContact}. Enter the 6 digit code mentioned in the text.
                  </p>

                  <OtpInput value={otp} onChange={setOtp} />
                  {otpErrorNote}
                  <div style={{ marginTop: 28 }}>{verifyButton}</div>
                  {resendRow}
                </>
              )}

              {step === 'reset' && (
                resetSuccess ? resetSuccessPanel : (
                  <>
                    <button
                      onClick={() => setStep('verify')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 20 }}
                    >
                      <ChevronLeft size={14} strokeWidth={2.5} /> Back
                    </button>

                    <h2 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>Set a new password</h2>
                    <p style={{ fontSize: 12, color: '#718096', marginBottom: 28, lineHeight: 1.6 }}>
                      Create a new password. Ensure it differs from previous ones for security.
                    </p>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                      />
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 6 }}>Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        style={{ width: '100%', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'Public Sans,sans-serif', outline: 'none', color: '#1f3151', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#008d46' }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                      />
                    </div>
                    {resetErrorNote}

                    {resetButton}
                  </>
                )
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </>
  )
}
