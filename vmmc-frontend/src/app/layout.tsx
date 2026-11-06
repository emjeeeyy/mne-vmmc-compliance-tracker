import type { Metadata } from 'next'
import CookieNotice from '@/components/CookieNotice'
import './globals.css'

export const metadata: Metadata = {
  title: 'VMMC Surveillance',
  description: 'TB DOTS & Pulmonary Compliance Registry',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CookieNotice />
      </body>
    </html>
  )
}
