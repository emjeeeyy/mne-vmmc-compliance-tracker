import { ACCOUNTS } from './support/accounts'
import { deleteLoginCodesSince } from './support/login-code'

/** Every login stores a session token next to its code; remove the rows this run created instead of leaving them. */
export default async function globalTeardown() {
  const since = process.env.E2E_STARTED_AT
  if (!since) return
  const ids = Object.values(ACCOUNTS).map((account) => account.employeeId)
  const deleted = await deleteLoginCodesSince(ids, since)
  console.log(`e2e: removed ${deleted} login code row(s) created by this run`)
}
