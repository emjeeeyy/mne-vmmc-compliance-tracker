import { ACCOUNTS } from './support/accounts'
import { apiLogin } from './support/sessions'

const FRONTEND = 'http://localhost:3000'

// Every page the specs open. On a freshly started dev server each one compiles on its first request, and when several
// parallel tests trigger that compile at once webpack reloads the pages that are already open, which wipes a login form
// halfway through being filled in (seen once: the login spec timed out on a blank form). Requesting them one by one up
// front means no test ever causes a compile. With a production build (CI) each request is instant.
const ROUTES = ['/login', '/dashboard', '/profile', '/compliance', '/notifications', '/upload', '/pii-index']

async function warmUpFrontend() {
  for (const route of ROUTES) {
    try {
      await fetch(`${FRONTEND}${route}`, { signal: AbortSignal.timeout(120_000) })
    } catch {
      // A route that fails to warm up is not fatal here: the spec that needs it will report the real problem.
    }
  }
}

/**
 * Signs the two main test roles in once, through the real login API (2FA and all), before any test runs. Most specs
 * then reuse these sessions instead of logging in again, which keeps the number of emailed codes to a handful per run
 * and means parallel tests never fight over one account's single-use code. The sessions travel to the test workers
 * through the environment (nothing is written to disk). The login screen itself is still tested end to end, once per
 * account, in e2e/ui/login.spec.ts.
 */
export default async function globalSetup() {
  process.env.E2E_STARTED_AT = new Date().toISOString()
  await warmUpFrontend()
  const sessions = {
    staff: await apiLogin(ACCOUNTS.staff),
    admin: await apiLogin(ACCOUNTS.admin),
  }
  process.env.E2E_SESSIONS = JSON.stringify(sessions)
}
