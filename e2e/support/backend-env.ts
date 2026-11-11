import fs from 'node:fs'
import path from 'node:path'

/**
 * The backend's own `.env`, read directly: the e2e suite has to talk to the same Supabase project the running
 * backend uses (it sets a known login code through the service-role key, see login-code.ts). Nothing here is
 * copied anywhere or written to disk; a value already in the real environment wins.
 */
export function backendEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess

  const file = path.resolve(__dirname, '../../vmmc-backend/.env')
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq > 0 && trimmed.slice(0, eq).trim() === name) {
        return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  throw new Error(
    `e2e needs ${name} to sign in through 2FA. Put it in vmmc-backend/.env (the backend needs it too) or export it in the shell.`,
  )
}
