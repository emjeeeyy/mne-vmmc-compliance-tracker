import type { Locator, Page } from '@playwright/test'
import { ACCOUNTS, type Role } from '../support/accounts'
import { primeLoginCode } from '../support/login-code'
import { getSession } from '../support/sessions'

/** The dedicated test accounts (docs/HANDOFF.md section 5; see e2e/support/accounts.ts for why they are separate). */
export const TEST_ACCOUNTS = ACCOUNTS

/** The signed-in account's real name. People rename themselves in Profile, so it is read from the session, not hardcoded. */
export const nameOf = (role: Role) => getSession(role).user.fullName

/**
 * Logs in through the real login screen, 2FA included: password, then the code step. The emailed code cannot be read
 * by a test, so once the backend has issued it the test swaps in a known code through the database (see
 * e2e/support/login-code.ts) and types that; the code is still verified by the real endpoint.
 *
 * Both mobile and desktop breakpoint blocks exist in the DOM simultaneously (see FRONTEND_STANDARDS.md section 9's
 * locator gotcha), so every selector here is scoped to `:visible` to target the block the viewport is showing.
 *
 * Only one login per account may be in flight at a time (a code is single-use), so only the login specs call this.
 */
export async function login(page: Page, { employeeId, password, portal }: { employeeId: string; password: string; portal: 'staff' | 'admin' }) {
  await page.goto('/login')

  if (portal === 'admin') {
    await page.locator('button:visible', { hasText: /^ADMIN LOGIN$/i }).first().click()
  }

  await page.locator('input[placeholder="Enter ID number"]:visible').fill(employeeId)
  await page.locator('input[placeholder="Enter password"]:visible').fill(password)
  await page.locator('button:visible', { hasText: /log in/i }).first().click()

  const codeField = page.locator('input[autocomplete="one-time-code"]:visible')
  await codeField.waitFor()
  await codeField.fill(await primeLoginCode(employeeId))
  await page.locator('button:visible', { hasText: /verify/i }).first().click()

  await page.waitForURL('**/dashboard')
}

/**
 * Starts the page already signed in as the staff or admin account global-setup.ts logged in once: the same two things
 * a real login leaves behind, namely the HttpOnly session cookie the API reads and the small session shell the UI
 * guard reads from sessionStorage. Call before the first `page.goto`.
 */
export async function signInAs(page: Page, role: Role) {
  const { accessToken, ...shell } = getSession(role)
  await page.context().addCookies([
    { name: 'vmmc_session', value: accessToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax', secure: false, expires: shell.expiresAt },
  ])
  await page.addInitScript((json) => sessionStorage.setItem('vmmc_session', json), JSON.stringify(shell))
}

/**
 * Every screen in this app renders both a mobile-native block and a tablet/desktop block
 * simultaneously (see FRONTEND_STANDARDS.md section 9's locator gotcha) — only one is actually visible
 * per viewport, but plain `getByText(...).first()` picks whichever comes first in DOM order,
 * which is not necessarily the visible one. This intersects the text match with `:visible` first.
 */
export function visibleText(page: Page, text: string | RegExp): Locator {
  return page.getByText(text).and(page.locator(':visible')).first()
}
