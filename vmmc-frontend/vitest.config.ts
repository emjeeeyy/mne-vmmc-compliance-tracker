import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Unit tests here are deliberately scoped to pure, dependency-free logic (src/lib/*) — no jsdom,
// no React plugin. Component rendering / user-flow coverage lives in the e2e/ suite at the repo
// root instead (Playwright, against the real running app), not here.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
