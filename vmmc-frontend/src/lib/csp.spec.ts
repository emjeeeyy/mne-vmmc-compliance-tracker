import { describe, expect, it } from 'vitest'
import { apiOriginFrom, buildCsp } from './csp'

const prod = (over: Partial<Parameters<typeof buildCsp>[0]> = {}) => buildCsp({ nonce: 'abc123', isDev: false, apiOrigin: 'https://api.example.com', ...over })
const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

describe('buildCsp (production)', () => {
  it('lets only nonce-carrying scripts run: no unsafe-inline, no unsafe-eval', () => {
    const script = directive(prod(), 'script-src')
    expect(script).toContain("'nonce-abc123'")
    expect(script).toContain("'strict-dynamic'")
    expect(script).not.toContain('unsafe-inline')
    expect(script).not.toContain('unsafe-eval')
  })

  it('only lets the page talk to itself and the API, so a stolen token cannot be sent to a stranger', () => {
    expect(directive(prod(), 'connect-src')).toBe("connect-src 'self' https://api.example.com")
    expect(directive(prod({ apiOrigin: null }), 'connect-src')).toBe("connect-src 'self'")
  })

  it('closes plugin, base-tag, form-target and framing routes', () => {
    const csp = prod()
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('still allows what the app genuinely loads: Google Fonts, data/blob images, Supabase-hosted files', () => {
    const csp = prod()
    expect(directive(csp, 'style-src')).toContain('https://fonts.googleapis.com')
    expect(directive(csp, 'font-src')).toContain('https://fonts.gstatic.com')
    expect(directive(csp, 'img-src')).toContain('data:')
    expect(directive(csp, 'img-src')).toContain('blob:')
    expect(directive(csp, 'img-src')).toContain('https://*.supabase.co')
    expect(directive(csp, 'frame-src')).toBe('frame-src https://*.supabase.co')
  })

  it('allows inline style attributes only, never inline style or script elements without the nonce', () => {
    const csp = prod()
    expect(directive(csp, 'style-src-attr')).toBe("style-src-attr 'unsafe-inline'")
    expect(directive(csp, 'style-src')).toContain("'nonce-abc123'")
    expect(directive(csp, 'style-src')).not.toContain('unsafe-inline')
  })

  it('uses a different nonce when given a different one', () => {
    expect(prod({ nonce: 'zzz' })).toContain("'nonce-zzz'")
    expect(prod({ nonce: 'zzz' })).not.toContain('abc123')
  })
})

describe('buildCsp (development)', () => {
  const dev = buildCsp({ nonce: 'n', isDev: true, apiOrigin: 'http://localhost:8443' })

  it('adds only what hot reloading needs', () => {
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(dev, 'style-src')).toContain("'unsafe-inline'")
    expect(directive(dev, 'connect-src')).toContain('ws:')
  })

  it('keeps scripts nonce-locked even in development', () => {
    expect(directive(dev, 'script-src')).toContain("'nonce-n'")
    expect(directive(dev, 'script-src')).not.toContain("'unsafe-inline'")
  })
})

describe('apiOriginFrom', () => {
  it('takes the origin of an absolute API address, dropping the path and any trailing slash', () => {
    expect(apiOriginFrom('https://api.example.com/api')).toBe('https://api.example.com')
    expect(apiOriginFrom('https://x.up.railway.app/api/')).toBe('https://x.up.railway.app')
    expect(apiOriginFrom('  http://localhost:8443/api  ')).toBe('http://localhost:8443')
  })

  it('is null for a relative address (the API is on the site itself) and defaults to local development when unset', () => {
    expect(apiOriginFrom('/api')).toBeNull()
    expect(apiOriginFrom(undefined)).toBe('http://localhost:8443')
  })
})
