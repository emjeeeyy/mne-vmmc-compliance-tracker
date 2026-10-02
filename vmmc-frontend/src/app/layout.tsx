import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VMMC Surveillance',
  description: 'TB DOTS & Pulmonary Compliance Registry',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
