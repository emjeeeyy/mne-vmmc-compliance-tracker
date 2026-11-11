/**
 * The dedicated test accounts (docs/HANDOFF.md section 5, added 2026-11-02), each with its own inbox, so a login
 * during a test never emails a teammate. Each parallel flow uses a different account on purpose: a login code is
 * single-use and only the newest counts, so two simultaneous logins as one account would break each other.
 *
 * - staff and admin: signed in once up front (global-setup.ts) and reused by most specs; the login specs also sign
 *   in through the real screen, one test per account.
 * - unitHead: used only by the API login-flow tests, so those never overlap with anything above.
 *
 * Names are deliberately not listed: people rename themselves in Profile (VMMC-25-0024 is no longer "Test Staff"),
 * so specs read the real name from the signed-in session instead.
 */
export const ACCOUNTS = {
  staff: { employeeId: 'VMMC-25-0024', password: 'asd123', portal: 'staff' },
  admin: { employeeId: 'VMMC-25-0026', password: 'asd123', portal: 'admin' },
  unitHead: { employeeId: 'VMMC-25-0025', password: 'asd123', portal: 'staff' },
} as const

export type Account = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]
export type Role = 'staff' | 'admin'
