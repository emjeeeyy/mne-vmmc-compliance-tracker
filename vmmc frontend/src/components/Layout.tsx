'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import VmmcSeal from './VmmcSeal'
import { Home, ClipboardList, Upload, UserCircle, ChevronDown, Menu, X, Folder, Bell, User, Users, FileText, LogOut, ShieldAlert } from 'lucide-react'
import { getRole, getUser, getInitials, logout } from '@/lib/auth'
import { api } from '@/lib/api'

interface NotificationItem {
  id: string
  status: string
  sentAt: string | null
  createdAt: string
  eventType: 'INFORMATIONAL' | 'WARNING' | 'EXCEPTION'
  eventSubtype: string
  severity: number
  message: string
}

function notificationStyle(eventType: NotificationItem['eventType']) {
  if (eventType === 'EXCEPTION') return { bg: '#fff5f5', border: '#feb2b2', color: '#c53030' }
  if (eventType === 'WARNING') return { bg: '#fffbea', border: '#f6e05e', color: '#b7791f' }
  return { bg: '#e6f9ee', border: '#9ae6b4', color: '#008d46' }
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function NotificationPanel({ notifications }: { notifications: NotificationItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxWidth: '85vw', maxHeight: 400, overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', padding: 8, zIndex: 60 }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 12px 6px' }}>
        Notifications
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: '20px 12px', fontSize: 13, color: '#a0aec0', textAlign: 'center' }}>No notifications yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {notifications.map(n => {
            const style = notificationStyle(n.eventType)
            return (
              <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: style.color, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1f3151', fontWeight: 600, lineHeight: 1.4 }}>{n.message}</div>
                  <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

const navItems = [
  { label: 'Home Dashboard', shortLabel: 'Home', path: '/dashboard', icon: Home, mobileIcon: Home },
  { label: 'Compliance Tracker', shortLabel: 'Compliance', path: '/compliance', icon: ClipboardList, mobileIcon: ClipboardList },
  { label: 'Results & Upload', shortLabel: 'Results', path: '/upload', icon: Upload, mobileIcon: Folder },
  { label: 'Profile Settings', shortLabel: 'Profile', path: '/profile', icon: UserCircle, mobileIcon: UserCircle },
]

/** All five admin nav items now have real destinations, each reusing the
 * matching staff route with content branched by role (see Dashboard.tsx /
 * Compliance.tsx / Upload.tsx / Profile.tsx) — except pii-index, which is
 * ADMIN-only end to end and has no staff-facing equivalent at all. */
const adminMobileNavItems = [
  { shortLabel: 'Home', path: '/dashboard', icon: Home },
  { shortLabel: 'Staff', path: '/compliance', icon: Users },
  { shortLabel: 'Queue', path: '/upload', icon: FileText },
  { shortLabel: 'PII', path: '/pii-index', icon: ShieldAlert },
  { shortLabel: 'Admin', path: '/profile', icon: UserCircle },
]

/** Desktop sidebar equivalent of adminMobileNavItems — same 5 destinations,
 * full labels matching each screen's actual admin heading (Compliance.tsx's
 * admin heading is "Staff Directory", Upload.tsx's is "Review Queue", etc.)
 * rather than reusing staff's `navItems` labels, which describe different
 * content at the same routes. */
const adminNavItems = [
  { label: 'Home Dashboard', path: '/dashboard', icon: Home },
  { label: 'Staff Directory', path: '/compliance', icon: Users },
  { label: 'Review Queue', path: '/upload', icon: FileText },
  { label: 'PII Information Index', path: '/pii-index', icon: ShieldAlert },
  { label: 'Admin Profile', path: '/profile', icon: UserCircle },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [role, setRole] = useState<'staff' | 'admin'>('staff')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => {
    setRole(getRole())
    const user = getUser()
    setFullName(user?.fullName ?? '')
    setJobTitle(user?.jobTitle ?? '')
    setEmployeeId(user?.employeeId ?? '')
  }, [pathname])

  useEffect(() => {
    api.get<NotificationItem[]>('/me/notifications').then(setNotifications).catch(() => {})
  }, [])

  useEffect(() => {
    if (!profileMenuOpen) return
    const close = () => setProfileMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [profileMenuOpen])

  useEffect(() => {
    if (!notificationsOpen) return
    const close = () => setNotificationsOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [notificationsOpen])

  const goTo = (path: string) => {
    router.push(path)
    setMobileNavOpen(false)
  }

  const handleLogout = () => {
    setProfileMenuOpen(false)
    logout()
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Phone-only mini header (< sm) */}
      <header className="flex sm:hidden" style={{ background: '#fff', height: 64, alignItems: 'center', padding: '0 20px', flexShrink: 0, borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <User size={20} color="#718096" />
        </div>
        <div style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
          {role === 'admin' ? (
            <>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ADMIN PANEL</div>
              <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>Management Portal</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
              <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>VMMC Staff ID: {employeeId}</div>
            </>
          )}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setNotificationsOpen(v => !v)}
            aria-label="Notifications"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1f3151', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: -4 }}
          >
            <span style={{ position: 'relative', display: 'flex' }}>
              <Bell size={20} />
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, background: '#e53e3e', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </span>
          </button>
          <AnimatePresence>
            {notificationsOpen && <NotificationPanel notifications={notifications} />}
          </AnimatePresence>
        </div>
      </header>

      {/* Tablet / desktop top bar — streamlined into a compact welcome bar per the
          Aug 31 feedback ("reduce the upperboard... streamline as compact welcome bar"):
          the institutional "Veterans Memorial Medical Center / Admin Management Portal"
          block was pure duplication of context already visible in the left-side branding
          and the profile pill's own role label, so it's replaced with a personal greeting
          instead of two more lines of boilerplate. Height trimmed 68→60 to match. */}
      <header
        className="hidden sm:flex px-4 sm:px-6"
        style={{ background: '#1c2538', height: 60, alignItems: 'center', flexShrink: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => setMobileNavOpen(v => !v)}
            className="flex lg:hidden"
            aria-label="Toggle navigation menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
          >
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <VmmcSeal size={36} />
          <div className="hidden sm:block" style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 17, fontWeight: 800, letterSpacing: '0.02em' }}>
            <span style={{ color: '#4ade80' }}>VMMC</span> <span style={{ color: '#fff' }}>SURVEILLANCE</span>
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <div className="hidden lg:block" style={{ marginRight: 24 }}>
            <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Welcome back, </span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{fullName.split(' ')[0] || (role === 'admin' ? 'Admin' : 'there')}</span>
          </div>

          <div className="hidden lg:block" style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)', marginRight: 24 }} />

          <div style={{ position: 'relative', marginRight: 20 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setNotificationsOpen(v => !v)}
              aria-label="Notifications"
              style={{ position: 'relative', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 999, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <Bell size={18} />
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, background: '#e53e3e', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #1c2538' }}>
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            <AnimatePresence>
              {notificationsOpen && <NotificationPanel notifications={notifications} />}
            </AnimatePresence>
          </div>

          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setProfileMenuOpen(v => !v)}
              style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px 6px 6px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {role === 'admin' ? (
                <>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #4299e1 0%, #1f3151 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0 }}>{getInitials(fullName)}</div>
                  <div className="hidden sm:block" style={{ textAlign: 'left' }}>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{fullName}</div>
                    <div style={{ color: '#63b3ed', fontSize: 12, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap' }}>{jobTitle}</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #4ade80 0%, #064e3b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0 }}>{getInitials(fullName)}</div>
                  <div className="hidden sm:block" style={{ textAlign: 'left' }}>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{fullName}</div>
                    <div style={{ color: '#4ade80', fontSize: 12, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap' }}>{jobTitle}</div>
                  </div>
                </>
              )}
              <motion.div animate={{ rotate: profileMenuOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="hidden sm:block" style={{ display: 'flex', marginLeft: 6 }}>
                <ChevronDown size={16} color="#fff" />
              </motion.div>
            </button>

            <AnimatePresence>
              {profileMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 200, background: '#fff', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', padding: 8, zIndex: 60 }}
                >
                  <button
                    onClick={handleLogout}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: 13, fontWeight: 700, fontFamily: 'Public Sans, sans-serif', textAlign: 'left', borderRadius: 10, transition: 'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fff5f5' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                  >
                    <LogOut size={16} strokeWidth={2.5} />
                    Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Mobile nav backdrop (tablet drawer only) */}
        {mobileNavOpen && (
          <div
            className="lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            style={{ position: 'fixed', top: 68, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          />
        )}

        {/* Sidebar — hidden entirely on phone (replaced by bottom tab bar), drawer on tablet, static on desktop */}
        <aside
          className={`hidden sm:block fixed top-[68px] bottom-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-out lg:static lg:top-auto lg:bottom-auto lg:z-auto lg:w-[250px] lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: '#1f3151', flexShrink: 0, padding: '32px 0', overflowY: 'auto' }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: '#a0aec0', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 32px', marginBottom: 20 }}>
            NAVIGATION MENU
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(role === 'admin' ? adminNavItems : navItems).map(({ label, path, icon: Icon }) => {
              const isActive = pathname === path
              return (
                <div key={path} style={{ position: 'relative', padding: '0 16px' }}>
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      style={{ position: 'absolute', inset: '0 16px', borderRadius: 12, background: '#294066', borderLeft: '4px solid #00b06b' }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <button
                    onClick={() => goTo(path)}
                    style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer', color: isActive ? '#fff' : '#a0aec0', fontSize: 13, fontWeight: 700, fontFamily: 'Public Sans, sans-serif', textAlign: 'left', transition: 'color 0.15s' }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#a0aec0' }}
                  >
                    <Icon size={20} />
                    {label}
                  </button>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Content Canvas */}
        <main className="p-4 pb-28 sm:p-6 lg:p-12" style={{ flex: 1, background: '#f8fafc', overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      {/* Phone-only bottom tab bar (< sm) */}
      <nav className="flex sm:hidden" style={{ position: 'fixed', bottom: 16, left: 16, right: 16, background: '#1f3151', borderRadius: 20, padding: '8px', alignItems: 'center', justifyContent: 'space-around', boxShadow: '0 12px 28px rgba(0,0,0,0.2)', zIndex: 30 }}>
        {role === 'admin'
          ? adminMobileNavItems.map(({ shortLabel, path, icon: Icon }) => {
              const isActive = path !== null && pathname === path
              return (
                <button
                  key={shortLabel}
                  onClick={() => path && goTo(path)}
                  aria-label={shortLabel}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: isActive ? '#00b06b' : 'transparent', border: 'none', borderRadius: 999, padding: isActive ? '10px 16px' : '10px 12px', minHeight: 44, color: '#fff', cursor: path ? 'pointer' : 'default', transition: 'background 0.2s' }}
                >
                  <Icon size={20} />
                  {isActive && <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}>{shortLabel}</span>}
                </button>
              )
            })
          : navItems.map(({ shortLabel, path, mobileIcon: Icon }) => {
              const isActive = pathname === path
              return (
                <button
                  key={path}
                  onClick={() => goTo(path)}
                  aria-label={shortLabel}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: isActive ? '#00b06b' : 'transparent', border: 'none', borderRadius: 999, padding: isActive ? '10px 16px' : '10px 12px', minHeight: 44, color: '#fff', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <Icon size={20} />
                  {isActive && <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}>{shortLabel}</span>}
                </button>
              )
            })}
      </nav>
    </div>
  )
}
