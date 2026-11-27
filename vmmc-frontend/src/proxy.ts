import { NextRequest, NextResponse } from 'next/server'
import { apiOriginFrom, buildCsp } from '@/lib/csp'

/**
 * Runs before every page request and attaches the Content-Security-Policy with a fresh nonce (see lib/csp.ts for what it
 * protects and why). Next.js reads the nonce back out of the header and stamps it on its own scripts and styles, which
 * only works for pages rendered per request, so the root layout opts in with `await connection()`.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    apiOrigin: apiOriginFrom(process.env.NEXT_PUBLIC_API_URL),
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // Skip static files and image optimisation (they carry no page scripts), and prefetches.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
