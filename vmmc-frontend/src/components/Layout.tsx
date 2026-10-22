'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import VmmcSeal from './VmmcSeal'
import { Home, ClipboardList, UserCircle, ChevronDown, Menu, X, Folder, Bell, User, Users, FileText, LogOut, TrendingUp, CheckSquare, Briefcase, CircleUserRound } from 'lucide-react'
import { getRole, getUser, getInitials, logout } from '@/lib/auth'
import { api } from '@/lib/api'
import { notificationStyle, timeAgo, type NotificationItem } from '@/lib/notifications'

function NotificationPanel({ notifications, onViewAll }: { notifications: NotificationItem[]; onViewAll: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxWidth: '85vw', maxHeight: 400, overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', padding: 8, zIndex: 60 }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: '#5f6b7d', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 12px 6px' }}>
        Notifications
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: '20px 12px', fontSize: 13, color: '#5f6b7d', textAlign: 'center' }}>No notifications yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {notifications.map(n => {
            const style = notificationStyle(n.eventType)
            return (
              <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: style.color, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1f3151', fontWeight: 600, lineHeight: 1.4 }}>{n.message}</div>
                  <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <button
        onClick={onViewAll}
        style={{ width: '100%', minHeight: 44, marginTop: 6, background: '#f4f7fb', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#1f3151', fontSize: 13, fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}
      >
        View all notifications
      </button>
    </motion.div>
  )
}

const navItems = [
  { label: 'My Health Profile', shortLabel: 'Health', path: '/dashboard', icon: TrendingUp, mobileIcon: Home, accent: '#4ade80' },
  { label: 'Submit Health Documents', shortLabel: 'Submit', path: '/upload', icon: CheckSquare, mobileIcon: Folder, accent: '#e1a13c' },
  { label: 'My Clearance & Logs', shortLabel: 'Clearance', path: '/compliance', icon: Briefcase, mobileIcon: ClipboardList, accent: '#80d4aa' },
  { label: 'Profile', shortLabel: 'Profile', path: '/profile', icon: CircleUserRound, mobileIcon: UserCircle, accent: '#85bcff' },
]

/** All five admin nav items now have real destinations, each reusing the
 * matching staff route with content branched by role (see Dashboard.tsx /
 * Compliance.tsx / Upload.tsx / Profile.tsx) — except notifications, which
 * is its own page (everyone can open it; only the admin nav links to it). */
const adminMobileNavItems = [
  { shortLabel: 'Home', path: '/dashboard', icon: Home },
  { shortLabel: 'Staff', path: '/compliance', icon: Users },
  { shortLabel: 'Queue', path: '/upload', icon: FileText },
  { shortLabel: 'Alerts', path: '/notifications', icon: Bell },
  { shortLabel: 'Admin', path: '/profile', icon: UserCircle },
]

/** Desktop sidebar equivalent of adminMobileNavItems — same 5 destinations,
 * full labels matching each screen's actual admin heading (Compliance.tsx's
 * admin heading is "Staff Directory", Upload.tsx's is "Review Queue", etc.)
 * rather than reusing staff's `navItems` labels, which describe different
 * content at the same routes. */
const adminNavItems = [
  { label: 'Health Overview', path: '/dashboard', icon: TrendingUp, accent: '#4ade80' },
  { label: 'Document Verification', path: '/upload', icon: CheckSquare, accent: '#e1a13c' },
  { label: 'Modules Registry', path: '/compliance', icon: Briefcase, accent: '#80d4aa' },
  { label: 'Notifications', path: '/notifications', icon: Bell, accent: '#7cc4ff' },
  { label: 'Profile', path: '/profile', icon: CircleUserRound, accent: '#85bcff' },
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

  const viewAllNotifications = () => {
    setNotificationsOpen(false)
    goTo('/notifications')
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
              <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2 }}>Management Portal</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 800, color: '#1f3151', letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
              <div style={{ fontSize: 12, color: '#5f6b7d', marginTop: 2 }}>VMMC Staff ID: {employeeId}</div>
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
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, background: '#c0262d', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </span>
          </button>
          <AnimatePresence>
            {notificationsOpen && <NotificationPanel notifications={notifications} onViewAll={viewAllNotifications} />}
          </AnimatePresence>
        </div>
      </header>

      {/* Tablet / desktop top bar — no sidebar: logo+brand, nav links inline (lg+), bell,
          profile pill, all in one row, matching the redesigned mockup's single-top-bar chrome.
          Below lg, the inline nav collapses behind a hamburger that opens a dropdown panel
          (not a side drawer — there's no sidebar left to drawer out from). */}
      <header className="hidden sm:block" style={{ background: 'linear-gradient(90deg, #1b2a47 0%, #265d4c 100%)', flexShrink: 0, position: 'relative' }}>
        {/* Three columns from xl: equal 1fr sides keep the nav at the true center regardless of logo/profile widths. */}
        <div className="flex xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 min-[1440px]:gap-6 h-[72px] xl:h-[80px] px-4 sm:px-6 lg:px-[2.7vw]" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <VmmcSeal size={40} />
            <div style={{ fontFamily: 'Poppins,sans-serif' }}>
              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: '16px', color: '#55c93f' }}>VMMC</div>
              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: '16px', color: '#fff' }}>SURVEILLANCE</div>
              <div className="hidden lg:block" style={{ fontSize: 11, fontWeight: 600, lineHeight: '14px', color: '#e7edf5', marginTop: 2 }}>Veterans Memorial Medical Center</div>
            </div>
          </div>

          {/* Centering makes both side columns equal, so the right side (bell + full-name pill, ~280px) sets the
              budget. At 1280–1439 the nav drops to 13px with tighter gaps so that budget fits; see PROGRESS_REPORT_3. */}
          <nav className={`hidden xl:flex ${role === 'admin' ? 'gap-2 min-[1440px]:gap-4' : 'gap-3 min-[1440px]:gap-6'}`} style={{ alignItems: 'center' }}>
            {(role === 'admin' ? adminNavItems : navItems).map(({ label, path, icon: Icon, accent }) => {
              const isActive = pathname === path
              return (
                <button
                  key={path}
                  onClick={() => goTo(path)}
                  aria-current={isActive ? 'page' : undefined}
                  className="gap-2 text-[13px] min-[1440px]:gap-[10px] min-[1440px]:text-[14px]"
                  style={{ display: 'flex', alignItems: 'center', padding: 0, minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer', color: isActive ? '#fff' : '#d7dce7', fontWeight: isActive ? 600 : 400, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap', transition: 'color 0.15s' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#d7dce7' }}
                >
                  {isActive ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 20, borderRadius: 4, background: accent, color: '#1b2a47', flexShrink: 0 }}>
                      <Icon size={13} strokeWidth={3} />
                    </span>
                  ) : (
                    <Icon size={18} color={accent} style={{ flexShrink: 0 }} />
                  )}
                  {label}
                </button>
              )
            })}
          </nav>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '100%', justifySelf: 'end' }}>
            <button
              onClick={() => setMobileNavOpen(v => !v)}
              className="flex xl:hidden"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileNavOpen}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setNotificationsOpen(v => !v)}
                aria-label={notifications.length > 0 ? `Notifications (${notifications.length})` : 'Notifications'}
                aria-expanded={notificationsOpen}
                className="w-10 h-10 min-[1440px]:w-11 min-[1440px]:h-11"
                style={{ position: 'relative', background: '#173d32', border: '1.5px solid #097542', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
              >
                <Bell size={16} />
                {notifications.length > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, background: '#c0262d', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #1b2a47' }}>
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {notificationsOpen && <NotificationPanel notifications={notifications} onViewAll={viewAllNotifications} />}
              </AnimatePresence>
            </div>

            <div style={{ position: 'relative', minWidth: 0 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setProfileMenuOpen(v => !v)}
                aria-expanded={profileMenuOpen}
                style={{ background: '#173d32', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 14px 0 5px', cursor: 'pointer', border: '1.5px solid #097542', fontFamily: 'Poppins,sans-serif', maxWidth: '100%', minWidth: 0 }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: role === 'admin' ? 'linear-gradient(135deg, #2b6cb0 0%, #1b2a47 100%)' : 'linear-gradient(135deg, #1b2a47 0%, #29623a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 }}>{getInitials(fullName)}</div>
                {/* Always visible. The cap per range is the room the right column actually has there, so an unusually
                    long name gets an ellipsis (full name on hover) instead of pushing the pill off-screen. */}
                <div className="hidden sm:block max-w-[140px] min-[1440px]:max-[1599px]:max-w-[150px] min-[1600px]:max-w-[220px]" style={{ textAlign: 'left', minWidth: 0, flex: '0 1 auto' }}>
                  <div title={fullName} style={{ color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
                  <div style={{ color: role === 'admin' ? '#63b3ed' : '#6cb693', fontSize: 12, fontWeight: 400, lineHeight: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jobTitle}</div>
                </div>
                <motion.div animate={{ rotate: profileMenuOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="hidden sm:block" style={{ display: 'flex', marginLeft: 4 }}>
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
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#b42318', fontSize: 13, fontWeight: 700, fontFamily: 'Public Sans, sans-serif', textAlign: 'left', borderRadius: 10, transition: 'background 0.15s' }}
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
        </div>

        {/* Tablet-width nav dropdown (sm to lg) — the inline nav above is lg+ only, so
            viewports in between need some way to navigate; a dropdown panel under the header
            rather than a side drawer, since there's no sidebar left to drawer out from. */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              className="xl:hidden"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ background: '#1b2a47', overflow: 'hidden' }}
            >
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(role === 'admin' ? adminNavItems : navItems).map(({ label, path, icon: Icon, accent }) => {
                  const isActive = pathname === path
                  return (
                    <button
                      key={path}
                      onClick={() => goTo(path)}
                  aria-current={isActive ? 'page' : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '10px 14px', minHeight: 48, borderRadius: 12, border: 'none', cursor: 'pointer', background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent', color: isActive ? '#fff' : '#d7dce7', fontSize: 14, fontWeight: isActive ? 700 : 500, fontFamily: 'Poppins, sans-serif', textAlign: 'left' }}
                    >
                      {isActive ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: accent, color: '#1c2538', flexShrink: 0 }}>
                          <Icon size={16} strokeWidth={2.5} />
                        </span>
                      ) : (
                        <Icon size={20} color={accent} style={{ flexShrink: 0 }} />
                      )}
                      {label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Content canvas — full width now that there's no sidebar to share it with */}
      {/* position: relative makes <main> the containing block for absolutely positioned descendants (e.g. Tailwind's
          .sr-only data tables). Without it they escape main's overflow clipping and stretch the document itself,
          which shows up as a second scrollbar next to main's own. */}
      <main className="p-4 pb-28 sm:p-6 lg:p-12" style={{ position: 'relative', flex: 1, background: '#f4f7f6', overflowY: 'auto' }}>
        {children}
      </main>

      {/* Phone-only bottom tab bar (< sm) */}
      <nav className="flex sm:hidden" style={{ position: 'fixed', bottom: 16, left: 16, right: 16, background: '#1f3151', borderRadius: 20, padding: '8px', alignItems: 'center', justifyContent: 'space-around', boxShadow: '0 12px 28px rgba(0,0,0,0.2)', zIndex: 30 }}>
        {role === 'admin'
          ? adminMobileNavItems.map(({ shortLabel, path, icon: Icon }) => {
              const isActive = path !== null && pathname === path
              return (
                <button
                  key={shortLabel}
                  onClick={() => path && goTo(path)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={shortLabel}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: isActive ? '#008541' : 'transparent', border: 'none', borderRadius: 999, padding: isActive ? '10px 16px' : '10px 12px', minHeight: 44, color: '#fff', cursor: path ? 'pointer' : 'default', transition: 'background 0.2s' }}
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
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={shortLabel}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: isActive ? '#008541' : 'transparent', border: 'none', borderRadius: 999, padding: isActive ? '10px 16px' : '10px 12px', minHeight: 44, color: '#fff', cursor: 'pointer', transition: 'background 0.2s' }}
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
