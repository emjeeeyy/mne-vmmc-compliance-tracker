import type { Account, Role } from './accounts'
import { E2E_LOGIN_CODE, primeLoginCode } from './login-code'

export const BACKEND = 'http://localhost:8443/api'

/** What a completed login returns (POST /auth/verify-login-otp). */
export interface ApiSession {
  accessToken: string
  expiresAt: number
  user: { id: string; employeeId: string; fullName: string; jobTitle: string | null; email: string; role: string; departmentId: string }
  mustChangePassword?: boolean
}

async function post<T>(route: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BACKEND}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T }
}

/**
 * The full real login through the API, 2FA included: password step, then the code step with a code the test set (see
 * login-code.ts). Fails loudly if the password step does not ask for a code, because 2FA being on is the contract.
 */
export async function apiLogin(account: Account): Promise<ApiSession> {
  const first = await post<{ mfaRequired?: boolean; message?: string }>('/auth/login', account)
  if (first.status !== 200) throw new Error(`e2e: login as ${account.employeeId} failed: HTTP ${first.status} ${first.json.message ?? ''}`)
  if (!first.json.mfaRequired) throw new Error(`e2e: ${account.employeeId} logged in without a code: is 2FA still on for this account?`)

  await primeLoginCode(account.employeeId)
  const second = await post<ApiSession & { message?: string }>('/auth/verify-login-otp', {
    employeeId: account.employeeId,
    portal: account.portal,
    otp: E2E_LOGIN_CODE,
  })
  if (second.status !== 200 || !second.json.accessToken) {
    throw new Error(`e2e: the code step failed for ${account.employeeId}: HTTP ${second.status} ${second.json.message ?? ''}`)
  }
  return second.json
}

/** The sessions global-setup.ts signed in once for the whole run (it passes them on through the environment). */
export function getSession(role: Role): ApiSession {
  const raw = process.env.E2E_SESSIONS
  if (!raw) throw new Error('e2e: no sessions found. global-setup.ts did not run, or it failed before signing in.')
  return (JSON.parse(raw) as Record<Role, ApiSession>)[role]
}
