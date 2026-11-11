import { test, expect } from '@playwright/test'
import { ACCOUNTS } from '../support/accounts'
import { E2E_LOGIN_CODE, primeLoginCode } from '../support/login-code'
import { apiLogin, getSession } from '../support/sessions'

// Pure API-level e2e — hits the backend directly (no browser), complementing the UI specs in
// e2e/ui/ which drive the same flows through the real frontend. 2FA is on for every account, so a
// correct password alone never returns a session: these tests cover that contract and then finish
// the login the way e2e/support/login-code.ts explains (a known code, verified by the real endpoint).
const STAFF = ACCOUNTS.staff
// The unit head account is used only for the tests that create a login code, so they never overlap
// with the sessions the UI specs reuse (a code is single-use and only the newest one counts).
const LOGIN_FLOW_ACCOUNT = ACCOUNTS.unitHead

test.describe('POST /api/auth/login', () => {
  test('health check responds ok', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })

  test('wrong password is rejected with 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: { ...STAFF, password: 'wrong' } })
    expect(res.status()).toBe(401)
  })

  test('correct credentials on the wrong portal are rejected with 403', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: { ...STAFF, portal: 'admin' } })
    expect(res.status()).toBe(403)
  })
})

test.describe('2FA login flow', () => {
  // One account, one login at a time: each step builds on the code the previous one issued.
  test.describe.configure({ mode: 'serial' })

  test('a correct password alone returns no session, only a request for the emailed code', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: LOGIN_FLOW_ACCOUNT })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.mfaRequired).toBe(true)
    expect(body.accessToken).toBeUndefined()
    expect(res.headers()['set-cookie']).toBeUndefined()
  })

  test('a wrong code is rejected', async ({ request }) => {
    // The previous test left a pending code for this account; make sure the wrong one really is wrong.
    await primeLoginCode(LOGIN_FLOW_ACCOUNT.employeeId)
    const res = await request.post('/api/auth/verify-login-otp', {
      data: { employeeId: LOGIN_FLOW_ACCOUNT.employeeId, portal: LOGIN_FLOW_ACCOUNT.portal, otp: E2E_LOGIN_CODE === '000000' ? '111111' : '000000' },
    })
    expect(res.status()).toBe(400)
  })

  test('the right code completes the login with a real access token', async () => {
    const session = await apiLogin(LOGIN_FLOW_ACCOUNT)
    expect(session.accessToken).toBeTruthy()
    expect(session.user.employeeId).toBe(LOGIN_FLOW_ACCOUNT.employeeId)
    expect(session.user.role).toBe('UNIT_HEAD')
  })
})

test.describe('Protected routes', () => {
  test('/api/me/profile rejects a request with no token', async ({ request }) => {
    const res = await request.get('/api/me/profile')
    expect(res.status()).toBe(401)
  })

  test('/api/me/profile returns the real logged-in employee with a valid token', async ({ request }) => {
    const { accessToken } = getSession('staff')

    const res = await request.get('/api/me/profile', { headers: { Authorization: `Bearer ${accessToken}` } })
    expect(res.status()).toBe(200)

    const profile = await res.json()
    expect(profile.employeeId).toBe(STAFF.employeeId)
    expect(profile.role).toBe('STAFF')
  })
})
