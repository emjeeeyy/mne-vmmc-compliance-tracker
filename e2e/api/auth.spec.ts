import { test, expect } from '@playwright/test'

// Pure API-level e2e — hits the backend directly (no browser), complementing the UI specs in
// e2e/ui/ which drive the same flows through the real frontend. Uses the same real test accounts
// documented in docs/HANDOFF.md §4.
const STAFF = { employeeId: 'VMMC-25-0021', password: 'asd123', portal: 'staff' as const }

test.describe('POST /api/auth/login', () => {
  test('health check responds ok', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })

  test('valid credentials return a real access token', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: STAFF })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.user.employeeId).toBe(STAFF.employeeId)
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

test.describe('Protected routes', () => {
  test('/api/me/profile rejects a request with no token', async ({ request }) => {
    const res = await request.get('/api/me/profile')
    expect(res.status()).toBe(401)
  })

  test('/api/me/profile returns the real logged-in employee with a valid token', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', { data: STAFF })
    const { accessToken } = await loginRes.json()

    const res = await request.get('/api/me/profile', { headers: { Authorization: `Bearer ${accessToken}` } })
    expect(res.status()).toBe(200)

    const profile = await res.json()
    expect(profile.employeeId).toBe(STAFF.employeeId)
    expect(profile.role).toBe('STAFF')
  })
})
