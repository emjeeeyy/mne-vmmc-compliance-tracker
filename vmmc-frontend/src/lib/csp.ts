/**
 * The Content-Security-Policy sent with every page (applied per request by src/proxy.ts).
 *
 * Why it matters here: in the split-site mode the sign-in token sits in the tab's sessionStorage (see
 * `shouldKeepTokenInBrowser` in lib/auth.ts), and the way someone could steal it is a script injected into a page.
 * This policy is what stops that script from running or from sending anything out:
 *  - `script-src` allows only scripts carrying this request's random nonce (and what they load). No `'unsafe-inline'`,
 *    no `'unsafe-eval'` in production, so an injected `<script>` or `onerror=` handler is refused by the browser.
 *  - `connect-src` allows requests only to this site and to the API, so even a script that did run could not send the
 *    token to a stranger's server.
 *  - `object-src`, `base-uri`, `form-action` and `frame-ancestors` close the other common injection routes.
 *
 * What it must still allow, because the app genuinely uses it: Google Fonts (stylesheet and font files), images from
 * this site, `data:` and `blob:` (signature images, SVG backgrounds), and uploaded files shown from Supabase Storage
 * signed links (document preview in an `<img>` or `<iframe>`).
 *
 * `style-src-attr 'unsafe-inline'` is deliberate: the app styles elements with inline `style` attributes everywhere,
 * and those are written into the server-rendered HTML, so blocking them would unstyle every page until hydration.
 * Inline styles cannot run code; scripts stay locked down.
 *
 * Pure and dependency-free so it is unit-tested (csp.spec.ts).
 */
export interface CspOptions {
  /** A fresh random value for this request, also placed on the page's own scripts by Next.js. */
  nonce: string
  /** `next dev` needs `eval` and inline styles for hot reloading; production does not. */
  isDev: boolean
  /** Origin of the API (for example https://api.example.com), or null when the API is on the website's own origin. */
  apiOrigin: string | null
}

const SUPABASE_STORAGE = 'https://*.supabase.co'

export function buildCsp({ nonce, isDev, apiOrigin }: CspOptions): string {
  const connect = ["'self'", ...(apiOrigin ? [apiOrigin] : []), ...(isDev ? ['ws:', 'wss:'] : [])]
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // A nonce makes browsers ignore 'unsafe-inline', and dev injects un-nonced <style> tags, so dev uses 'unsafe-inline' instead.
    isDev ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" : `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${SUPABASE_STORAGE}`,
    `frame-src ${SUPABASE_STORAGE}`,
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  return directives.join('; ')
}

/** The API's origin from NEXT_PUBLIC_API_URL, or null when it is relative ("/api") and so on this site's own origin. */
export function apiOriginFrom(apiUrl: string | undefined): string | null {
  const value = apiUrl?.trim()
  if (!value) return 'http://localhost:8443'
  try {
    return /^https?:\/\//i.test(value) ? new URL(value).origin : null
  } catch {
    return null
  }
}
