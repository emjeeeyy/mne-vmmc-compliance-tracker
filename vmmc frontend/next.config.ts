import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Silences Next's workspace-root inference warning — the root-level package.json (added for the
// `npm run dev` convenience script) has its own package-lock.json, which Next mistakes for a
// monorepo root. This repo is not a workspace/monorepo; this app's own directory is the root.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
}

export default nextConfig
