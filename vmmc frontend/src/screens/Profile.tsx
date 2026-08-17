'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Lock, Smartphone, Shield, Activity, Check, User, LogOut, Clock, ChevronRight, ChevronLeft, Eye, X, Info } from 'lucide-react'
import { fadeRise } from '@/lib/motion'
import { logout, getRole, getInitials } from '@/lib/auth'
import { api, ApiError, ApiConnectionError } from '@/lib/api'
import { formatBirthDate, calculateAge, formatLogTime } from '@/lib/format'

function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof ApiConnectionError) return 'Connection is slow — please try again.'
  return fallback
}

interface ActivityLogEntry { title: string; time: string; ip: string | null }
interface LoginHistoryEntry { device: string; ip: string | null; time: string; current: boolean }
interface DeviceEntry { id: string; name: string; deviceType: string | null; lastActive: string | null; isCurrent: boolean }

const securityRows: { icon: typeof Lock; title: string; desc: string; action: string; view: PrivacyView }[] = [
  { icon: Lock, title: 'Change PIN', desc: 'Secure your desktop surveillance account with a unique lockpin.', action: 'CHANGE PIN', view: 'pin' },
  { icon: Smartphone, title: 'Manage Registered Devices', desc: 'View and authenticate devices linked to your VMMC profile.', action: 'CONFIGURE', view: 'devices' },
  { icon: Shield, title: 'Data Privacy Settings', desc: 'Enforce health registry encryption and adjust data telemetry visibility rules.', action: 'REVIEW SETTINGS', view: 'data' },
]

type MobileModalKey = 'activity' | 'privacy' | 'account'

type AdminView = 'signature' | 'privacy'

type MenuRow = { icon: typeof Clock; color: string; bg: string; label: string; modalKey: MobileModalKey | null; view?: AdminView }

const mobileMenuRows: MenuRow[] = [
  { icon: Clock, color: '#4299e1', bg: '#ebf8ff', label: 'Activity Logs', modalKey: 'activity' },
  { icon: Shield, color: '#38a169', bg: '#f0fff4', label: 'Privacy & Security', modalKey: 'privacy' },
  { icon: User, color: '#dd8b3a', bg: '#fffaf0', label: 'Account Security', modalKey: 'account' },
]

const adminMenuRows: MenuRow[] = [
  { icon: Clock, color: '#4299e1', bg: '#ebf8ff', label: 'Digital Signature', modalKey: null, view: 'signature' },
  { icon: Shield, color: '#38a169', bg: '#f0fff4', label: 'Privacy & Security', modalKey: null, view: 'privacy' },
]

interface PerformanceStats { reviews: number; approvals: number; approvalRate: number }

type AdminPrivacyView = 'list' | 'password' | '2fa' | 'history'

type PrivacyView = 'list' | 'pin' | 'devices' | 'data'

const mobilePrivacyRows: { icon: typeof Lock; label: string; view: PrivacyView }[] = [
  { icon: Lock, label: 'Change PIN', view: 'pin' },
  { icon: Smartphone, label: 'Manage Devices', view: 'devices' },
  { icon: Eye, label: 'Data Privacy Settings', view: 'data' },
]

const privacyViewTitle: Record<PrivacyView, string> = {
  list: 'PRIVACY & SECURITY',
  pin: 'CHANGE PIN',
  devices: 'MANAGE DEVICES',
  data: 'DATA PRIVACY SETTINGS',
}

const dataPrivacyOptions = [
  { key: 'encryptRecords', label: 'Encrypt Health Records', desc: 'Apply end-to-end encryption to stored compliance and lab result data.' },
  { key: 'shareAnalytics', label: 'Share Analytics with Department', desc: 'Allow anonymized compliance trends to be visible to your department head.' },
  { key: 'telemetryLogging', label: 'Enable Telemetry Logging', desc: 'Log account activity on this device for security auditing purposes.' },
] as const

/** ISO timestamp -> "Today, 8:42 AM" / "Jul 12, 2026, 6:15 PM" */
function formatRelativeTime(iso: string | null) {
  if (!iso) return 'Unknown'
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today, ${timePart}`
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${timePart}`
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{ width: 42, height: 24, borderRadius: 999, background: checked ? '#008d46' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

export default function Profile() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeModal, setActiveModal] = useState<MobileModalKey | null>(null)
  const [privacyView, setPrivacyView] = useState<PrivacyView>('list')
  const [role, setRole] = useState<'staff' | 'admin'>('staff')
  const [adminView, setAdminView] = useState<AdminView | null>(null)

  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([])
  const [loginHistoryEntries, setLoginHistoryEntries] = useState<LoginHistoryEntry[]>([])
  const [devices, setDevices] = useState<DeviceEntry[]>([])
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({ reviews: 0, approvals: 0, approvalRate: 0 })

  useEffect(() => {
    setRole(getRole())
  }, [])

  useEffect(() => {
    api.get<{ fullName: string; email: string; phone: string | null; jobTitle: string | null; employeeId: string; birthDate: string }>('/me/profile')
      .then((data) => {
        setDisplayName(data.fullName)
        setEmail(data.email)
        setPhone(data.phone ?? '')
        setJobTitle(data.jobTitle ?? '')
        setEmployeeId(data.employeeId)
        setBirthDate(data.birthDate)
      })
      .catch(() => {})
    api.get<ActivityLogEntry[]>('/me/activity-logs').then(setActivityLogs).catch(() => {})
    api.get<LoginHistoryEntry[]>('/me/login-history').then(setLoginHistoryEntries).catch(() => {})
    api.get<DeviceEntry[]>('/me/devices').then(setDevices).catch(() => {})
    api.get<Partial<typeof dataToggles>>('/me/privacy-settings')
      .then((settings) => setDataToggles((prev) => ({ ...prev, ...settings })))
      .catch(() => {}) // endpoint depends on a migration that may not be applied yet — keep local defaults
  }, [])

  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [signatureSaving, setSignatureSaving] = useState(false)
  const [signatureError, setSignatureError] = useState('')
  const [drawMode, setDrawMode] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const signatureFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (role !== 'admin') return
    api.get<PerformanceStats>('/me/performance-stats').then(setPerformanceStats).catch(() => {})
  }, [role])

  useEffect(() => {
    if (role !== 'admin') return
    let cancelled = false
    api
      .get<{ id: string; imageUrl: string | null } | null>('/me/signature')
      .then((data) => { if (!cancelled && data) setSignatureImage(data.imageUrl) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [role])

  const saveSignatureImage = async (dataUrl: string) => {
    setSignatureSaving(true)
    setSignatureError('')
    try {
      const saved = await api.post<{ id: string; imageUrl: string | null }>('/me/signature', { imageDataUrl: dataUrl })
      setSignatureImage(saved.imageUrl ?? dataUrl)
    } catch (err) {
      setSignatureError(apiErrorMessage(err, 'Could not save signature. Please try again.'))
    } finally {
      setSignatureSaving(false)
    }
  }

  const [adminPrivacyView, setAdminPrivacyView] = useState<AdminPrivacyView>('list')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwAttempted, setPwAttempted] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [passwordChangedLabel, setPasswordChangedLabel] = useState('Manage your account password')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true)

  const adminStats = [
    { label: 'Reviews', value: String(performanceStats.reviews), color: '#1f3151' },
    { label: 'Approvals', value: String(performanceStats.approvals), color: '#008d46' },
    { label: 'Approval Rate', value: `${performanceStats.approvalRate}%`, color: '#008d46' },
  ]

  const adminPrivacyRows: { icon: typeof Clock; color: string; bg: string; label: string; subtitle: string; view: AdminPrivacyView }[] = [
    { icon: Lock, color: '#4299e1', bg: '#ebf8ff', label: 'Change Password', subtitle: passwordChangedLabel, view: 'password' },
    { icon: Smartphone, color: '#38a169', bg: '#f0fff4', label: 'Two-Factor Authentication', subtitle: twoFactorEnabled ? 'Enabled' : 'Disabled', view: '2fa' },
    { icon: Clock, color: '#dd8b3a', bg: '#fffaf0', label: 'Login History', subtitle: loginHistoryEntries[0] ? `Last active ${formatRelativeTime(loginHistoryEntries[0].time)}` : 'View recent sign-ins', view: 'history' },
  ]

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinAttempted, setPinAttempted] = useState(false)
  const [pinSaved, setPinSaved] = useState(false)
  const [pinServerError, setPinServerError] = useState('')

  const [dataToggles, setDataToggles] = useState({
    encryptRecords: true,
    shareAnalytics: false,
    telemetryLogging: true,
  })

  const handleLogout = () => { logout(); router.push('/login') }

  const handleSave = async () => {
    setSaveError('')
    try {
      await api.patch('/me/profile', { fullName: displayName, email, phone })
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not save changes. Please try again.'))
    }
  }

  const closeModal = () => { setActiveModal(null); setPrivacyView('list') }

  let pinErrorMessage = ''
  if (!newPin || !confirmPin) pinErrorMessage = '*Please fill in all fields.'
  else if (newPin.length < 4) pinErrorMessage = '*PIN must be at least 4 digits.'
  else if (newPin !== confirmPin) pinErrorMessage = '*New PIN does not match.'

  const handlePinInput = (setter: (v: string) => void) => (raw: string) => setter(raw.replace(/\D/g, '').slice(0, 6))

  const handleUpdatePin = async () => {
    setPinAttempted(true)
    setPinServerError('')
    if (pinErrorMessage) return
    try {
      await api.patch('/me/security/pin', { currentPin: currentPin || undefined, newPin })
      setPinSaved(true)
      setTimeout(() => {
        setPinSaved(false)
        setCurrentPin('')
        setNewPin('')
        setConfirmPin('')
        setPinAttempted(false)
        setPrivacyView('list')
      }, 1400)
    } catch (err) {
      setPinServerError(apiErrorMessage(err, 'Could not update PIN. Please try again.'))
    }
  }

  const removeDevice = async (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id))
    try {
      await api.delete(`/me/devices/${id}`)
    } catch {
      api.get<DeviceEntry[]>('/me/devices').then(setDevices).catch(() => {}) // out of sync — resync from the server
    }
  }

  const toggleDataPrivacy = (key: keyof typeof dataToggles) => {
    setDataToggles(prev => {
      const next = { ...prev, [key]: !prev[key] }
      api.patch('/me/privacy-settings', { [key]: next[key] }).catch(() => {})
      return next
    })
  }

  const inputStyle = { width: '100%', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', outline: 'none', transition: 'border-color 0.2s' }
  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#008d46' }
  const blurInput = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#e2e8f0' }

  const canvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true
    setHasDrawn(true)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = canvasPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const drawStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = canvasPos(e)
    ctx.strokeStyle = '#1f3151'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  const endDraw = () => { isDrawingRef.current = false }

  const openDrawPad = () => {
    setDrawMode(true)
    setHasDrawn(false)
    requestAnimationFrame(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    })
  }
  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }
  const saveDrawing = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return
    setDrawMode(false)
    void saveSignatureImage(canvas.toDataURL('image/png'))
  }

  const handleSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => void saveSignatureImage(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const deleteSignature = async () => {
    setSignatureSaving(true)
    setSignatureError('')
    try {
      await api.delete('/me/signature')
      setSignatureImage(null)
    } catch (err) {
      setSignatureError(apiErrorMessage(err, 'Could not delete signature. Please try again.'))
    } finally {
      setSignatureSaving(false)
    }
  }

  let pwErrorMessage = ''
  if (!currentPassword || !newPassword || !confirmPassword) pwErrorMessage = '*Please fill in all fields.'
  else if (newPassword.length < 8) pwErrorMessage = '*Password must be at least 8 characters.'
  else if (newPassword !== confirmPassword) pwErrorMessage = '*New password does not match.'
  const [pwServerError, setPwServerError] = useState('')

  /** `onDone` lets mobile and desktop land somewhere different after a
   * successful update: mobile returns to the "list" sub-view (its real
   * navigation waypoint), desktop skips straight to the main profile page
   * (mirrors the same mobile-vs-desktop split as handleAdminBack/Desktop). */
  const handleUpdatePassword = async (onDone?: () => void) => {
    setPwAttempted(true)
    setPwServerError('')
    if (pwErrorMessage) return
    try {
      await api.patch('/me/security/password', { currentPassword, newPassword })
      setPwSaved(true)
      setTimeout(() => {
        setPwSaved(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPwAttempted(false)
        setPasswordChangedLabel('Last changed just now')
        if (onDone) onDone()
        else setAdminPrivacyView('list')
      }, 1400)
    } catch (err) {
      setPwServerError(apiErrorMessage(err, 'Could not update password. Please try again.'))
    }
  }

  const handleAdminBack = () => {
    if (adminView === 'privacy' && adminPrivacyView !== 'list') { setAdminPrivacyView('list'); return }
    if (adminView === 'signature' && drawMode) { setDrawMode(false); return }
    setAdminView(null)
    setAdminPrivacyView('list')
    setDrawMode(false)
  }

  const adminBackLabel = (adminView === 'privacy' && adminPrivacyView !== 'list') || (adminView === 'signature' && drawMode) ? 'Back' : 'Back to Profile'

  /** Desktop-only back handler. On desktop the "Privacy & Security" quick-access
   * card already lists Change Password / Two-Factor Authentication / Login History
   * directly — there's no separate "tap into the list first" step like on mobile —
   * so backing out of a sub-view should return straight to the Admin Profile page,
   * not stop at the (redundant, desktop-only-reachable-via-Back) list view. */
  const handleAdminBackDesktop = () => {
    if (adminView === 'signature' && drawMode) { setDrawMode(false); return }
    setAdminView(null)
    setAdminPrivacyView('list')
    setDrawMode(false)
  }
  const adminBackLabelDesktop = adminView === 'signature' && drawMode ? 'Back' : 'Back to Profile'

  return (
    <div>
      {/* Mobile-native profile (phones, < sm) */}
      <div className="sm:hidden">
        {adminView ? (
          <div>
            <motion.button
              custom={0}
              variants={fadeRise}
              initial="hidden"
              animate="visible"
              onClick={handleAdminBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: 0, marginBottom: 20 }}
            >
              <ChevronLeft size={16} /> {adminBackLabel}
            </motion.button>

            {adminView === 'signature' && (
              <>
                <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 16 }}>
                  {drawMode ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, textAlign: 'center' }}>Draw your signature below</div>
                      <canvas
                        ref={canvasRef}
                        width={300}
                        height={140}
                        onPointerDown={startDraw}
                        onPointerMove={drawStroke}
                        onPointerUp={endDraw}
                        onPointerLeave={endDraw}
                        style={{ display: 'block', width: 300, height: 140, maxWidth: '100%', margin: '0 auto 14px', background: '#f8fafc', borderRadius: 14, border: '1px dashed #cbd5e0', touchAction: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={clearCanvas} style={{ flex: 1, padding: '13px 0', background: '#fff', color: '#1f3151', border: '1px solid #e2e8f0', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>Clear</button>
                        <button
                          onClick={saveDrawing}
                          disabled={!hasDrawn || signatureSaving}
                          style={{ flex: 1, padding: '13px 0', background: hasDrawn ? '#008d46' : '#a0e0bc', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: hasDrawn ? 'pointer' : 'not-allowed', opacity: signatureSaving ? 0.75 : 1 }}
                        >
                          {signatureSaving ? 'Saving…' : 'Save Signature'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ background: '#f1f5f9', borderRadius: 14, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden' }}>
                        {signatureImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={signatureImage} alt="Saved signature" style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: 13, color: '#a0aec0', fontStyle: 'italic' }}>No signature saved</span>
                        )}
                      </div>
                      {signatureError && (
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginTop: -8, marginBottom: 12, textAlign: 'center' }}>{signatureError}</p>
                      )}
                      <div style={{ display: 'flex', gap: 10, marginBottom: signatureImage ? 10 : 0 }}>
                        <button onClick={openDrawPad} disabled={signatureSaving} style={{ flex: 1, padding: '13px 0', background: '#fff', color: '#1f3151', border: '1px solid #e2e8f0', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>{signatureImage ? 'Redraw' : 'Draw'}</button>
                        <button onClick={() => signatureFileRef.current?.click()} disabled={signatureSaving} style={{ flex: 1, padding: '13px 0', background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>{signatureSaving ? 'Saving…' : signatureImage ? 'Replace' : 'Upload'}</button>
                        <input ref={signatureFileRef} type="file" accept="image/png" style={{ display: 'none' }} onChange={handleSignatureFile} />
                      </div>
                      {signatureImage && (
                        <button onClick={deleteSignature} disabled={signatureSaving} style={{ width: '100%', padding: '13px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>Delete Signature</button>
                      )}
                    </>
                  )}
                </motion.div>

                <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', gap: 10, background: '#fffaf0', border: '1px solid #feebc8', borderRadius: 14, padding: 14 }}>
                  <Info size={16} color="#dd8b3a" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#b7791f', lineHeight: 1.5, textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                    Your signature will be applied automatically to all approved medical clearance
                  </span>
                </motion.div>
              </>
            )}

            {adminView === 'privacy' && adminPrivacyView === 'list' && (
              <div>
                {adminPrivacyRows.map((row, i) => (
                  <motion.button
                    key={row.label}
                    custom={i + 1}
                    variants={fadeRise}
                    initial="hidden"
                    animate="visible"
                    onClick={() => setAdminPrivacyView(row.view)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12, border: 'none', cursor: 'pointer' }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: row.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <row.icon size={18} color={row.color} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1f3151' }}>{row.label}</div>
                      <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 2 }}>{row.subtitle}</div>
                    </div>
                    <ChevronRight size={18} color="#cbd5e0" />
                  </motion.button>
                ))}
              </div>
            )}

            {adminView === 'privacy' && adminPrivacyView === 'password' && (
              <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6, marginBottom: 20 }}>
                  Update the password used to sign in to your Admin account.
                </p>
                {[
                  { label: 'Current Password', value: currentPassword, onChange: setCurrentPassword },
                  { label: 'New Password', value: newPassword, onChange: setNewPassword },
                  { label: 'Confirm New Password', value: confirmPassword, onChange: setConfirmPassword },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 6 }}>{f.label}</label>
                    <input
                      type="password"
                      value={f.value}
                      onChange={e => f.onChange(e.target.value)}
                      placeholder="••••••••"
                      style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
                    />
                  </div>
                ))}
                {pwAttempted && pwErrorMessage && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 16 }}>
                    {pwErrorMessage}
                  </motion.p>
                )}
                {pwAttempted && !pwErrorMessage && pwServerError && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 16 }}>
                    {pwServerError}
                  </motion.p>
                )}
                <button
                  onClick={() => handleUpdatePassword()}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: '#008d46', color: '#fff', border: 'none', borderRadius: 14, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  <AnimatePresence mode="wait">
                    {pwSaved
                      ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} /> Password Updated!</motion.span>
                      : <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Update Password</motion.span>
                    }
                  </AnimatePresence>
                </button>
              </motion.div>
            )}

            {adminView === 'privacy' && adminPrivacyView === '2fa' && (
              <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1f3151', marginBottom: 4 }}>Enable Two-Factor Authentication</div>
                    <div style={{ fontSize: 11, color: '#a0aec0', lineHeight: 1.5 }}>Require a one-time verification code in addition to your password when signing in.</div>
                  </div>
                  <ToggleSwitch checked={twoFactorEnabled} onChange={() => setTwoFactorEnabled(v => !v)} />
                </div>
                {twoFactorEnabled && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: 10, background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 14, padding: 14, marginTop: 16 }}>
                    <Check size={16} color="#008d46" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2f855a', lineHeight: 1.5 }}>
                      Verification codes will be sent to your registered device on every new sign-in.
                    </span>
                  </motion.div>
                )}
              </motion.div>
            )}

            {adminView === 'privacy' && adminPrivacyView === 'history' && (
              <div>
                <p style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6, marginBottom: 16 }}>
                  Recent sign-ins to your Admin account.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {loginHistoryEntries.map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: entry.current ? '#e6f9ee' : '#f8fafc', border: entry.current ? 'none' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Clock size={16} color={entry.current ? '#008d46' : '#718096'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1f3151' }}>{entry.device}</div>
                        <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 2 }}>{entry.ip ?? 'Unknown IP'} • {formatRelativeTime(entry.time)}</div>
                      </div>
                      {entry.current && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#008d46', background: '#e6f9ee', borderRadius: 999, padding: '4px 8px', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>Current</span>
                      )}
                    </div>
                  ))}
                  {loginHistoryEntries.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#a0aec0', fontSize: 12, padding: '20px 0' }}>No sign-ins recorded yet.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 20, padding: '28px 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <User size={36} color="#a0aec0" />
          </div>
          {role === 'admin' ? (
            <>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151', marginBottom: 4, textAlign: 'center' }}>{displayName}</div>
              <div style={{ fontSize: 12, color: '#718096', fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>{jobTitle}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', width: '100%', gap: 8, marginBottom: 20 }}>
                {adminStats.map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 18, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: '#a0aec0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151', marginBottom: 8 }}>{displayName}</div>
              <span style={{ background: '#e6f9ee', color: '#008d46', borderRadius: 999, padding: '5px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 20 }}>{jobTitle}</span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', width: '100%', gap: 8, marginBottom: 20 }}>
                {[{ label: 'Birthday', value: formatBirthDate(birthDate) }, { label: 'Age', value: calculateAge(birthDate) }, { label: 'Staff ID', value: employeeId }].map(f => (
                  <div key={f.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#a0aec0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1f3151' }}>{f.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            onClick={handleLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            <LogOut size={14} strokeWidth={2.5} /> Logout From Session
          </button>
        </motion.div>

        {role === 'admin' && (
          <div style={{ fontSize: 11, fontWeight: 800, color: '#a0aec0', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 }}>Management</div>
        )}

        {(role === 'admin' ? adminMenuRows : mobileMenuRows).map((row, i) => (
          <motion.button
            key={row.label}
            custom={i + 1}
            variants={fadeRise}
            initial="hidden"
            animate="visible"
            onClick={() => (row.view ? setAdminView(row.view) : row.modalKey && setActiveModal(row.modalKey))}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 12, border: 'none', cursor: 'pointer' }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: row.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <row.icon size={18} color={row.color} />
            </div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1f3151', letterSpacing: '0.02em', textTransform: 'uppercase', textAlign: 'left' }}>{row.label}</span>
            <ChevronRight size={18} color="#cbd5e0" />
          </motion.button>
        ))}

          </>
        )}
      </div>

      {/* Tablet / desktop profile */}
      <div className="hidden sm:block">
        {role === 'admin' ? (
          adminView ? (
            <>
              <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 24 }}>
                <button
                  onClick={handleAdminBackDesktop}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#2b6cb0', fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: 0 }}
                >
                  <ChevronLeft size={16} /> {adminBackLabelDesktop}
                </button>
              </motion.div>

              <div className="flex flex-col lg:flex-row gap-6" style={{ alignItems: 'flex-start' }}>
                <div className="w-full lg:w-[340px] lg:flex-shrink-0 flex flex-col gap-6">
                  <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 100, background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)' }} />
                    <div style={{ padding: '0 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -42 }}>
                      <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: '#1f3151', border: '5px solid #fff', marginBottom: 16 }}>{getInitials(displayName)}</div>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: '#1f3151', textAlign: 'center' }}>{displayName}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#2b6cb0', margin: '6px 0 8px', textAlign: 'center' }}>{jobTitle}</div>
                      <div style={{ fontSize: 13, color: '#a0aec0', textAlign: 'center', marginBottom: 32 }}>{employeeId}</div>
                      <motion.button onClick={handleLogout} whileHover={{ filter: 'brightness(0.95)', y: -1 }} whileTap={{ scale: 0.98 }}
                        style={{ width: '100%', padding: '14px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
                      >LOGOUT FROM SESSION</motion.button>
                    </div>
                  </motion.div>

                  <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px 28px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Activity size={20} color="#2b6cb0" />
                        <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>PERFORMANCE<br/>OVERVIEW</span>
                      </div>
                      <span style={{ color: '#a0aec0', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.3 }}>ALL<br/>TIME</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {adminStats.map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
                          <div style={{ fontSize: 9, color: '#a0aec0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </div>

                <div className="w-full lg:flex-1 flex flex-col gap-6">
              {adminView === 'signature' && (
                <>
                  <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 24 }}>
                    <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Digital Signature</h1>
                  </motion.div>

                  <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
                    {drawMode ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14, textAlign: 'center' }}>Draw your signature below</div>
                        <canvas
                          ref={canvasRef}
                          width={480}
                          height={200}
                          onPointerDown={startDraw}
                          onPointerMove={drawStroke}
                          onPointerUp={endDraw}
                          onPointerLeave={endDraw}
                          style={{ display: 'block', width: '100%', maxWidth: 480, height: 200, margin: '0 auto 20px', background: '#f8fafc', borderRadius: 16, border: '1px dashed #cbd5e0', touchAction: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: 12, maxWidth: 320, margin: '0 auto' }}>
                          <button onClick={clearCanvas} style={{ flex: 1, padding: '13px 0', background: '#fff', color: '#1f3151', border: '1px solid #e2e8f0', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>Clear</button>
                          <button
                            onClick={saveDrawing}
                            disabled={!hasDrawn || signatureSaving}
                            style={{ flex: 1, padding: '13px 0', background: hasDrawn ? '#008d46' : '#a0e0bc', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: hasDrawn ? 'pointer' : 'not-allowed', opacity: signatureSaving ? 0.75 : 1 }}
                          >
                            {signatureSaving ? 'Saving…' : 'Save Signature'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ background: '#f1f5f9', borderRadius: 16, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' }}>
                          {signatureImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={signatureImage} alt="Saved signature" style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: 13, color: '#a0aec0', fontStyle: 'italic' }}>No signature saved</span>
                          )}
                        </div>
                        {signatureError && (
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginTop: -10, marginBottom: 14, textAlign: 'center' }}>{signatureError}</p>
                        )}
                        <div style={{ display: 'flex', gap: 12, maxWidth: 320, margin: signatureImage ? '0 auto 12px' : '0 auto' }}>
                          <button onClick={openDrawPad} disabled={signatureSaving} style={{ flex: 1, padding: '13px 0', background: '#fff', color: '#1f3151', border: '1px solid #e2e8f0', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>{signatureImage ? 'Redraw' : 'Draw'}</button>
                          <button onClick={() => signatureFileRef.current?.click()} disabled={signatureSaving} style={{ flex: 1, padding: '13px 0', background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>{signatureSaving ? 'Saving…' : signatureImage ? 'Replace' : 'Upload'}</button>
                          <input ref={signatureFileRef} type="file" accept="image/png" style={{ display: 'none' }} onChange={handleSignatureFile} />
                        </div>
                        {signatureImage && (
                          <div style={{ maxWidth: 320, margin: '0 auto' }}>
                            <button onClick={deleteSignature} disabled={signatureSaving} style={{ width: '100%', padding: '13px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>Delete Signature</button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>

                  <motion.div custom={3} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', gap: 12, background: '#fffaf0', border: '1px solid #feebc8', borderRadius: 16, padding: 18 }}>
                    <Info size={18} color="#dd8b3a" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#b7791f', lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                      Your signature will be applied automatically to all approved medical clearance
                    </span>
                  </motion.div>
                </>
              )}

              {adminView === 'privacy' && (
                <>
                  <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 24 }}>
                    <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>
                      {adminPrivacyView === 'list' ? 'Privacy & Security' : adminPrivacyRows.find(r => r.view === adminPrivacyView)?.label}
                    </h1>
                    {adminPrivacyView === 'list' && <p style={{ fontSize: 13, color: '#718096', margin: 0 }}>Manage sign-in credentials, verification, and session history for your Admin account.</p>}
                  </motion.div>

                  {adminPrivacyView === 'list' && (
                    <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '8px 32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      {adminPrivacyRows.map((row, i) => (
                        <button
                          key={row.label}
                          onClick={() => setAdminPrivacyView(row.view)}
                          className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5"
                          style={{ width: '100%', padding: '20px 0', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: row.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <row.icon size={20} color={row.color} strokeWidth={1.5} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>{row.label}</div>
                            <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.5 }}>{row.subtitle}</div>
                          </div>
                          <ChevronRight size={18} color="#cbd5e0" style={{ flexShrink: 0 }} />
                        </button>
                      ))}
                    </motion.div>
                  )}

                  {adminPrivacyView === 'password' && (
                    <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <p style={{ fontSize: 13, color: '#a0aec0', lineHeight: 1.6, marginBottom: 24 }}>
                        Update the password used to sign in to your Admin account.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" style={{ marginBottom: 20 }}>
                        {[
                          { label: 'Current Password', value: currentPassword, onChange: setCurrentPassword },
                          { label: 'New Password', value: newPassword, onChange: setNewPassword },
                        ].map(f => (
                          <div key={f.label}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 8 }}>{f.label}</label>
                            <input type="password" value={f.value} onChange={e => f.onChange(e.target.value)} placeholder="••••••••" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom: 24, maxWidth: 320 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 8 }}>Confirm New Password</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                      </div>
                      {pwAttempted && pwErrorMessage && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 12, fontWeight: 700, color: '#c53030', marginBottom: 20 }}>
                          {pwErrorMessage}
                        </motion.p>
                      )}
                      {pwAttempted && !pwErrorMessage && pwServerError && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 12, fontWeight: 700, color: '#c53030', marginBottom: 20 }}>
                          {pwServerError}
                        </motion.p>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <motion.button onClick={() => handleUpdatePassword(() => { setAdminView(null); setAdminPrivacyView('list') })} whileHover={{ filter: 'brightness(1.1)', y: -1 }} whileTap={{ scale: 0.97 }}
                          style={{ background: '#008d46', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        >
                          <AnimatePresence mode="wait">
                            {pwSaved
                              ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={16} /> PASSWORD UPDATED!</motion.span>
                              : <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>UPDATE PASSWORD</motion.span>
                            }
                          </AnimatePresence>
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {adminPrivacyView === '2fa' && (
                    <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 800, color: '#1f3151', marginBottom: 6 }}>Enable Two-Factor Authentication</div>
                          <div style={{ fontSize: 13, color: '#a0aec0', lineHeight: 1.6 }}>Require a one-time verification code in addition to your password when signing in.</div>
                        </div>
                        <ToggleSwitch checked={twoFactorEnabled} onChange={() => setTwoFactorEnabled(v => !v)} />
                      </div>
                      {twoFactorEnabled && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: 12, background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 14, padding: 16, marginTop: 24 }}>
                          <Check size={18} color="#008d46" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2f855a', lineHeight: 1.6 }}>
                            Verification codes will be sent to your registered device on every new sign-in.
                          </span>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {adminPrivacyView === 'history' && (
                    <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <p style={{ fontSize: 13, color: '#a0aec0', lineHeight: 1.6, marginBottom: 20 }}>
                        Recent sign-ins to your Admin account.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {loginHistoryEntries.map((entry, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f8fafc', borderRadius: 14, padding: 16 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: entry.current ? '#e6f9ee' : '#fff', border: entry.current ? 'none' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Clock size={18} color={entry.current ? '#008d46' : '#718096'} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f3151' }}>{entry.device}</div>
                              <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 2 }}>{entry.ip ?? 'Unknown IP'} • {formatRelativeTime(entry.time)}</div>
                            </div>
                            {entry.current && (
                              <span style={{ fontSize: 10, fontWeight: 800, color: '#008d46', background: '#e6f9ee', borderRadius: 999, padding: '5px 10px', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>Current</span>
                            )}
                          </div>
                        ))}
                        {loginHistoryEntries.length === 0 && (
                          <div style={{ textAlign: 'center', color: '#a0aec0', fontSize: 12, padding: '20px 0' }}>No sign-ins recorded yet.</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
                </div>
              </div>
            </>
          ) : (
            <>
              <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 32 }}>
                <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Admin Profile &amp; Security</h1>
                <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Manage your credentials, digital signature, and account security as Medical Director.</p>
              </motion.div>

              <div className="flex flex-col lg:flex-row gap-6" style={{ alignItems: 'flex-start' }}>
                <div className="w-full lg:w-[340px] lg:flex-shrink-0 flex flex-col gap-6">
                  <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 100, background: 'linear-gradient(135deg, #1f3151 0%, #1c4b6e 100%)' }} />
                    <div style={{ padding: '0 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -42 }}>
                      <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: '#1f3151', border: '5px solid #fff', marginBottom: 16 }}>{getInitials(displayName)}</div>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: '#1f3151', textAlign: 'center' }}>{displayName}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#2b6cb0', margin: '6px 0 8px', textAlign: 'center' }}>{jobTitle}</div>
                      <div style={{ fontSize: 13, color: '#a0aec0', textAlign: 'center', marginBottom: 32 }}>{employeeId}</div>
                      <motion.button onClick={handleLogout} whileHover={{ filter: 'brightness(0.95)', y: -1 }} whileTap={{ scale: 0.98 }}
                        style={{ width: '100%', padding: '14px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
                      >LOGOUT FROM SESSION</motion.button>
                    </div>
                  </motion.div>

                  <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px 28px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Activity size={20} color="#2b6cb0" />
                        <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>PERFORMANCE<br/>OVERVIEW</span>
                      </div>
                      <span style={{ color: '#a0aec0', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.3 }}>ALL<br/>TIME</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {adminStats.map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
                          <div style={{ fontSize: 9, color: '#a0aec0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </div>

                <div className="w-full lg:flex-1 flex flex-col gap-6">
                  <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <Clock size={18} color="#4299e1" />
                      <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>DIGITAL SIGNATURE</span>
                    </div>
                    <div className="flex flex-col xl:flex-row items-center gap-6">
                      <div style={{ background: '#f1f5f9', borderRadius: 16, width: '100%', maxWidth: 220, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {signatureImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={signatureImage} alt="Saved signature" style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: 12, color: '#a0aec0', fontStyle: 'italic' }}>No signature saved</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.6, marginBottom: 16 }}>Applied automatically to all approved medical clearances.</div>
                        <motion.button onClick={() => setAdminView('signature')} whileHover={{ filter: 'brightness(1.1)', y: -1 }} whileTap={{ scale: 0.97 }}
                          style={{ background: '#008d46', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer' }}
                        >
                          Manage Signature
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                      <Shield size={18} color="#38a169" />
                      <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>PRIVACY &amp; SECURITY</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {adminPrivacyRows.map((row, i) => (
                        <button
                          key={row.label}
                          onClick={() => { setAdminView('privacy'); setAdminPrivacyView(row.view) }}
                          className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5"
                          style={{ width: '100%', padding: '20px 0', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: row.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <row.icon size={20} color={row.color} strokeWidth={1.5} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>{row.label}</div>
                            <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.5 }}>{row.subtitle}</div>
                          </div>
                          <ChevronRight size={18} color="#cbd5e0" style={{ flexShrink: 0 }} />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </>
          )
        ) : (
        <>
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible" style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Poppins,sans-serif', fontSize: 26, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>Profile & Security</h1>
          <p style={{ fontSize: 14, color: '#718096', marginBottom: 0 }}>Manage personal details, inspect surveillance audits, review login sessions, and edit security constraints.</p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6" style={{ alignItems: 'flex-start' }}>
          <div className="w-full lg:w-[340px] lg:flex-shrink-0 flex flex-col gap-6">
            <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 100, background: 'linear-gradient(135deg, #093c2b 0%, #008d46 100%)' }} />
              <div style={{ padding: '0 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -42 }}>
                <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: '#1f3151', border: '5px solid #fff', marginBottom: 16 }}>{getInitials(displayName)}</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: '#1f3151', textAlign: 'center' }}>{displayName}</div>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#008d46', margin: '6px 0 8px' }}>{jobTitle}</div>
                <div style={{ fontSize: 13, color: '#a0aec0', textAlign: 'center', marginBottom: 32 }}>{employeeId}</div>
                <motion.button onClick={handleLogout} whileHover={{ filter: 'brightness(0.95)', y: -1 }} whileTap={{ scale: 0.98 }}
                  style={{ width: '100%', padding: '14px 0', background: '#fff5f5', color: '#e53e3e', border: 'none', borderRadius: 999, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
                >LOGOUT FROM SESSION</motion.button>
              </div>
            </motion.div>

            <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px 28px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Activity size={20} color="#008d46" />
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>ACTIVITY<br/>LOGS</span>
                </div>
                <span style={{ color: '#a0aec0', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.3 }}>INTERACTIVE<br/>LOG</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {activityLogs.map((log, i) => (
                  <motion.div key={i} custom={i + 3} variants={fadeRise} initial="hidden" animate="visible" style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#008d46', flexShrink: 0, marginTop: 6 }} />
                    <div>
                      <div style={{ fontFamily: 'Public Sans,sans-serif', fontSize: 14, fontWeight: 700, color: '#1f3151', marginBottom: 4, lineHeight: 1.3 }}>{log.title}</div>
                      <div style={{ fontSize: 11, color: '#a0aec0', lineHeight: 1.5 }}>{formatLogTime(log.time)} · IP:<br/>{log.ip ?? 'Unknown'}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="w-full lg:flex-1 flex flex-col gap-6">
            <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <Settings size={18} color="#008d46" />
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>ACCOUNT SETTINGS</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" style={{ marginBottom: 20 }}>
                {[{ label: 'DISPLAY NAME', value: displayName, onChange: setDisplayName }, { label: 'EMAIL ADDRESS', value: email, onChange: setEmail }].map(f => (
                  <div key={f.label}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 8 }}>{f.label}</label>
                    <input value={f.value} onChange={e => f.onChange(e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 8 }}>OFFICE PHONE / MOBILE NO.</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} onFocus={focusInput} onBlur={blurInput} />
              </div>
              {saveError && (
                <p style={{ fontSize: 12, fontWeight: 700, color: '#c53030', marginBottom: 16, textAlign: 'right' }}>{saveError}</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <motion.button onClick={handleSave} whileHover={{ filter: 'brightness(1.1)', y: -1 }} whileTap={{ scale: 0.97 }}
                  style={{ background: '#008d46', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px', fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <AnimatePresence mode="wait">
                    {saved
                      ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={16} /> SAVED!</motion.span>
                      : <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>SAVE CHANGES</motion.span>
                    }
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>

            <motion.div custom={2} variants={fadeRise} initial="hidden" animate="visible" style={{ background: '#fff', borderRadius: 24, padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <Lock size={18} color="#008d46" />
                <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1f3151' }}>PRIVACY &amp; SECURITY</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {securityRows.map(({ icon: Icon, title, desc, action, view }, i) => {
                  const actionLines = action.split(' ');
                  return (
                    <div key={title} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5" style={{ padding: '20px 0', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={20} color="#1f3151" strokeWidth={1.5} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 800, color: '#1f3151', marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.5 }}>{desc}</div>
                      </div>
                      <motion.button
                        onClick={() => { setActiveModal('privacy'); setPrivacyView(view) }}
                        whileHover={{ x: -2 }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008d46', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0, textAlign: 'center', lineHeight: 1.3 }}
                      >
                        {actionLines.map((line, idx) => <div key={idx}>{line}</div>)}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Shared PIN/Devices/Data-Privacy/Account modal — reachable from both the mobile
          menu rows and the desktop "Privacy & Security" quick-access row, so it isn't
          gated behind the sm:hidden breakpoint like the rest of the mobile layout. */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 360, padding: 22, boxShadow: '0 24px 48px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {activeModal === 'privacy' && privacyView !== 'list' && (
                    <button onClick={() => setPrivacyView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151', padding: 4, marginLeft: -4, display: 'flex' }}>
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#1f3151', letterSpacing: '0.02em' }}>
                    {activeModal === 'activity' && 'ACTIVITY LOGS'}
                    {activeModal === 'privacy' && privacyViewTitle[privacyView]}
                    {activeModal === 'account' && 'ACCOUNT SETTINGS'}
                  </span>
                </div>
                <button onClick={closeModal} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              {activeModal === 'activity' && (
                <div>
                  {activityLogs.map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '14px 0', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#008d46', flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1f3151', marginBottom: 3 }}>{log.title}</div>
                        <div style={{ fontSize: 11, color: '#a0aec0' }}>{formatLogTime(log.time)}</div>
                      </div>
                    </div>
                  ))}
                  {activityLogs.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#a0aec0', fontSize: 12, padding: '20px 0' }}>No activity yet.</div>
                  )}
                </div>
              )}

              {activeModal === 'privacy' && privacyView === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {mobilePrivacyRows.map(row => (
                    <button key={row.label} onClick={() => setPrivacyView(row.view)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: 'none', borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
                      <row.icon size={17} color="#1f3151" strokeWidth={1.5} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1f3151', textAlign: 'left' }}>{row.label}</span>
                      <ChevronRight size={16} color="#cbd5e0" />
                    </button>
                  ))}
                </div>
              )}

              {activeModal === 'privacy' && privacyView === 'pin' && (
                <div>
                  <p style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6, marginBottom: 20 }}>
                    Secure your account with a unique lockpin. You&apos;ll use this PIN to confirm sensitive actions.
                  </p>
                  {[
                    { label: 'Current PIN', value: currentPin, onChange: handlePinInput(setCurrentPin) },
                    { label: 'New PIN', value: newPin, onChange: handlePinInput(setNewPin) },
                    { label: 'Confirm New PIN', value: confirmPin, onChange: handlePinInput(setConfirmPin) },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 6 }}>{f.label}</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        value={f.value}
                        onChange={e => f.onChange(e.target.value)}
                        placeholder="••••"
                        style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 15, letterSpacing: '0.3em', fontFamily: 'Public Sans,sans-serif', color: '#1f3151', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
                      />
                    </div>
                  ))}
                  {pinAttempted && pinErrorMessage && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 16 }}>
                      {pinErrorMessage}
                    </motion.p>
                  )}
                  {pinAttempted && !pinErrorMessage && pinServerError && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 16 }}>
                      {pinServerError}
                    </motion.p>
                  )}
                  <button
                    onClick={handleUpdatePin}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: '#008d46', color: '#fff', border: 'none', borderRadius: 14, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <AnimatePresence mode="wait">
                      {pinSaved
                        ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} /> PIN Updated!</motion.span>
                        : <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Update PIN</motion.span>
                      }
                    </AnimatePresence>
                  </button>
                </div>
              )}

              {activeModal === 'privacy' && privacyView === 'devices' && (
                <div>
                  <p style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6, marginBottom: 16 }}>
                    View and authenticate devices linked to your VMMC profile.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {devices.map(d => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', borderRadius: 14, padding: '12px 14px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: d.isCurrent ? '#e6f9ee' : '#fff', border: d.isCurrent ? 'none' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Smartphone size={16} color={d.isCurrent ? '#008d46' : '#718096'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1f3151' }}>{d.name}</div>
                          <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 2 }}>{d.deviceType ?? 'Device'} • {formatRelativeTime(d.lastActive)}</div>
                        </div>
                        {d.isCurrent ? (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#008d46', background: '#e6f9ee', borderRadius: 999, padding: '4px 8px', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>This Device</span>
                        ) : (
                          <button onClick={() => removeDevice(d.id)} style={{ fontSize: 10, fontWeight: 800, color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', flexShrink: 0 }}>Remove</button>
                        )}
                      </div>
                    ))}
                    {devices.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#a0aec0', fontSize: 12, padding: '20px 0' }}>No other devices registered.</div>
                    )}
                  </div>
                </div>
              )}

              {activeModal === 'privacy' && privacyView === 'data' && (
                <div>
                  <p style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6, marginBottom: 4 }}>
                    Enforce health registry encryption and adjust data telemetry visibility rules.
                  </p>
                  <div>
                    {dataPrivacyOptions.map((opt, i) => (
                      <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1f3151', marginBottom: 2 }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: '#a0aec0', lineHeight: 1.4 }}>{opt.desc}</div>
                        </div>
                        <ToggleSwitch checked={dataToggles[opt.key]} onChange={() => toggleDataPrivacy(opt.key)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeModal === 'account' && (
                <div>
                  {[
                    { label: 'Display Name', value: displayName, onChange: setDisplayName },
                    { label: 'Email Address', value: email, onChange: setEmail },
                    { label: 'Mobile Number', value: phone, onChange: setPhone },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096', marginBottom: 6 }}>{f.label}</label>
                      <input
                        value={f.value}
                        onChange={e => f.onChange(e.target.value)}
                        style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, fontFamily: 'Public Sans,sans-serif', color: '#1f3151', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
                      />
                    </div>
                  ))}
                  {saveError && (
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#c53030', marginBottom: 12 }}>{saveError}</p>
                  )}
                  <button
                    onClick={handleSave}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: '#008d46', color: '#fff', border: 'none', borderRadius: 14, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
                  >
                    <AnimatePresence mode="wait">
                      {saved
                        ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} /> Saved!</motion.span>
                        : <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Save Changes</motion.span>
                      }
                    </AnimatePresence>
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
