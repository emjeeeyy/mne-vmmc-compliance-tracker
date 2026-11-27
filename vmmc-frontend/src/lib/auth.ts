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
/** The token itself, kept in this tab's session storage ONLY in the split-site mode described below. */
const TOKEN_KEY = 'vmmc_token'
const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() ?? 'http://localhost:8443/api'

/**
 * Where does the sign-in token live?
 *
 * Normally in the backend's HttpOnly cookie, which page scripts cannot read. A cookie only works when the website
 * and the API are on the SAME site (localhost, or app.example.com plus api.example.com). When they are on different
 * sites (a Vercel address plus a Railway or Render address), Safari, iPhones and incognito windows refuse that cookie,
 * so sign-in would succeed and the next request would be anonymous. In that situation (and only then) the token is kept
 * in this tab's sessionStorage and sent as an `Authorization: Bearer` header, which the backend already accepts.
 *
 * Cost: a script injected into the page could read the token. It is limited by a strict Content-Security-Policy
 * (src/proxy.ts), the app inserting no raw HTML, a 60-minute lifetime and tab-only storage (never localStorage).
 *
 * `override` is NEXT_PUBLIC_SESSION_TOKEN_MODE: "cookie" forces cookie-only (use it once both sit under one domain),
 * "header" forces the header mode; anything else decides by comparing the two host names.
 */
export function shouldKeepTokenInBrowser(apiUrl: string, pageHostname: string, override?: string): boolean {
  const mode = (override ?? '').trim().toLowerCase()
  if (mode === 'cookie') return false
  if (mode === 'header') return true
  try {
    // A relative API address ("/api") is served by the website itself, so it resolves to the page's own host.
    const apiHost = new URL(apiUrl, `http://${pageHostname}`).hostname.toLowerCase()
    return apiHost !== pageHostname.toLowerCase()
  } catch {
    return false
  }
}

function keepTokenInBrowser(): boolean {
  return typeof window !== 'undefined' && shouldKeepTokenInBrowser(API_URL, window.location.hostname, process.env.NEXT_PUBLIC_SESSION_TOKEN_MODE)
}

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as AuthSession
    if (session.expiresAt * 1000 < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
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
  const { accessToken, ...safeSession } = session
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeSession))
  // The token never goes into the session summary above. It is stored separately, and only when a cookie cannot work.
  if (keepTokenInBrowser() && accessToken) sessionStorage.setItem(TOKEN_KEY, accessToken)
  else sessionStorage.removeItem(TOKEN_KEY)
}

export function setPasswordChangeRequired(required: boolean) {
  const session = readSession()
  if (!session) return
  session.mustChangePassword = required
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

/** Fired on `window` after the stored user changes, so already-mounted UI (the navbar) can re-read it. */
export const USER_UPDATED_EVENT = 'vmmc:user-updated'

/** The session with the self-editable identity fields replaced (pure, so it can be unit-tested). */
export function withUserUpdate(session: AuthSession, patch: Partial<Pick<AuthUser, 'fullName' | 'email'>>): AuthSession {
  return { ...session, user: { ...session.user, ...patch } }
}

/** Call after a successful `PATCH /me/profile`. The navbar reads the name from the session shell written at login,
 * so without this it keeps showing the old name until the person logs out and back in. */
export function updateUser(patch: Partial<Pick<AuthUser, 'fullName' | 'email'>>) {
  const session = readSession()
  if (!session) return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(withUserUpdate(session, patch)))
  window.dispatchEvent(new Event(USER_UPDATED_EVENT))
}

export function logout() {
  const session = readSession()
  const token = getToken()
  sessionStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(TOKEN_KEY)

  if (session) {
    // In the split-site mode the server only knows who is logging out from the header, so send it.
    fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    }).catch(() => {})
  }
}

export function getToken(): string | null {
  // Normally null: the bearer token lives in an HttpOnly secure cookie that the browser sends by itself when
  // `credentials: 'include'` is set, and the frontend keeps only a non-secret session summary in sessionStorage.
  // Only in the split-site mode (see shouldKeepTokenInBrowser) is the token in this tab's storage, and only while the
  // session is still valid.
  if (!keepTokenInBrowser() || readSession() === null) return null
  return sessionStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  return readSession()?.user ?? null
}

export function requiresPasswordChange(): boolean {
  return readSession()?.mustChangePassword ?? false
}

export function getInitials(name: string) {
  // Drop trailing credentials ("Maria Santos, RN" -> "Maria Santos") so they don't become the last initial.
  const parts = name.split(',')[0].trim().split(/\s+/).filter(Boolean)
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
