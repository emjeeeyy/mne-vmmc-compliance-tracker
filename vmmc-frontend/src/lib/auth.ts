export type UserRole = 'staff' | 'admin'
export type PreciseRole = 'STAFF' | 'UNIT_HEAD' | 'ADMIN'

export interface AuthUser {
  id: string
  employeeId: string
  fullName: string
  jobTitle: string | null
  email: string
  role: PreciseRole
  departmentId: string
}

export interface AuthSession {
  accessToken: string
  expiresAt: number
  user: AuthUser
  mustChangePassword?: boolean
}

const STORAGE_KEY = 'vmmc_session'

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as AuthSession
    if (session.expiresAt * 1000 < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function isAuthenticated() {
  return readSession() !== null
}

/** Called by Login.tsx once the real login API call succeeds. */
export function login(session: AuthSession) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function setPasswordChangeRequired(required: boolean) {
  const session = readSession()
  if (!session) return
  session.mustChangePassword = required
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function logout() {
  const session = readSession()
  sessionStorage.removeItem(STORAGE_KEY)

  if (session) {
    // Best-effort session revoke — mirrors the backend's own best-effort logout.
    // Not awaited: the UI navigates away immediately either way.
    fetch(`${process.env.NEXT_PUBLIC_API_URL?.trim() ?? 'http://localhost:8443/api'}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).catch(() => {})
  }
}

export function getToken(): string | null {
  return readSession()?.accessToken ?? null
}

export function getUser(): AuthUser | null {
  return readSession()?.user ?? null
}

export function requiresPasswordChange(): boolean {
  return readSession()?.mustChangePassword ?? false
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return (parts[0][0] + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

/**
 * Legacy staff/admin shape the existing screens branch their UI on. UNIT_HEAD
 * maps to the "staff door" persona (dept-scoped staff UI) per the buildspec —
 * the STAFF-vs-UNIT_HEAD distinction within that door is Phase 3's job.
 */
export function getRole(): UserRole {
  return getUser()?.role === 'ADMIN' ? 'admin' : 'staff'
}

/** The real backend-confirmed role, for phases that need the STAFF/UNIT_HEAD distinction. */
export function getPreciseRole(): PreciseRole | null {
  return getUser()?.role ?? null
}
