import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Silences Next's workspace-root inference warning — the root-level package.json (added for the
// `npm run dev` convenience script) has its own package-lock.json, which Next mistakes for a
// monorepo root. This repo is not a workspace/monorepo; this app's own directory is the root.
// Local-only: Vercel already sets its own `outputFileTracingRoot` to match its checkout (it sets
// `VERCEL=1` during every build), and forcing `turbopack.root` on top of that there makes the two
// disagree — Next treats that as fatal mid-build on Vercel instead of just warning like it does locally.
const nextConfig: NextConfig = {
  // The Content-Security-Policy itself is set per request in src/proxy.ts (it needs a fresh nonce each time). These
  // are the fixed companions: no content-type guessing, no referrer leaking to other sites, no framing of the app.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
  ...(process.env.VERCEL
    ? {}
    : {
        turbopack: {
          root: path.dirname(fileURLToPath(import.meta.url)),
        },
      }),
}

export default nextConfig
