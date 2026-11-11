import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as bcrypt from 'bcryptjs'
import { backendEnv } from './backend-env'

/**
 * Why this exists: 2FA is on for every account, so a correct password only gets you to "enter the code from your
 * email", and a test cannot read an inbox. Instead of turning 2FA off (which would stop testing the real flow) or
 * adding a bypass to the backend (a hole in the login path), the test waits for the backend to store the code it just
 * issued, then overwrites that stored hash with the hash of a code the test knows. The backend then verifies the code
 * exactly as it would for a person, through the real endpoint. The real email still goes out and is simply ignored.
 *
 * Only for a development database. It needs the service-role key, which the backend already needs to run.
 */
export const E2E_LOGIN_CODE = '482913'

let client: SupabaseClient | null = null
function supabase(): SupabaseClient {
  client ??= createClient(backendEnv('SUPABASE_URL'), backendEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function employeeUuid(employeeId: string): Promise<string> {
  const { data, error } = await supabase().from('employees').select('id').eq('employee_id', employeeId).maybeSingle()
  if (error || !data) throw new Error(`e2e: no employee ${employeeId} found (${error?.message ?? 'no row'})`)
  return data.id as string
}

/**
 * Call right after the password step succeeded (the backend has already stored the code by the time it answers).
 * Replaces the stored code of every still-pending login for this employee with E2E_LOGIN_CODE and returns it.
 *
 * Only one login per account may be in flight at a time: a code is single-use and only the newest one counts, so two
 * parallel logins as the same account would consume each other's code. The suite keeps accounts apart for that reason.
 */
export async function primeLoginCode(employeeId: string, timeoutMs = 10_000): Promise<string> {
  const id = await employeeUuid(employeeId)
  const hash = bcrypt.hashSync(E2E_LOGIN_CODE, 10)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data: pending } = await supabase()
      .from('login_otps')
      .select('id')
      .eq('employee_id', id)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
    if (pending && pending.length > 0) {
      const { error } = await supabase()
        .from('login_otps')
        .update({ otp_hash: hash, attempt_count: 0 })
        .in('id', pending.map((row) => row.id))
      if (error) throw new Error(`e2e: could not set the login code for ${employeeId}: ${error.message}`)
      return E2E_LOGIN_CODE
    }
    await sleep(150)
  }
  throw new Error(`e2e: no pending login code appeared for ${employeeId}. Did the password step succeed, and is 2FA on for this account?`)
}

/**
 * Housekeeping after a run: every login stores the freshly issued session token next to its code, so rows the run
 * created are deleted rather than left behind. Only rows created since `sinceIso` for the given employees.
 */
export async function deleteLoginCodesSince(employeeIds: string[], sinceIso: string): Promise<number> {
  let deleted = 0
  for (const employeeId of employeeIds) {
    const id = await employeeUuid(employeeId)
    const { data } = await supabase().from('login_otps').delete().eq('employee_id', id).gte('created_at', sinceIso).select('id')
    deleted += data?.length ?? 0
  }
  return deleted
}
