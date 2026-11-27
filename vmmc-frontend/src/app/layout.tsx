import type { Metadata } from 'next'
import { connection } from 'next/server'
import CookieNotice from '@/components/CookieNotice'
import './globals.css'

export const metadata: Metadata = {
  title: 'VMMC Surveillance',
  description: 'TB DOTS & Pulmonary Compliance Registry',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The Content-Security-Policy (src/proxy.ts) carries a fresh nonce per request, and Next.js can only stamp it on a page's
  // scripts when the page is rendered for that request. Without this the pages would be prerendered once at build time,
  // carry no nonce, and a strict policy would block all of their scripts.
  await connection()

  return (
    <html lang="en">
      <body>
        {children}
        <CookieNotice />
      </body>
    </html>
  )
}
