'use client'

import Layout from '@/components/Layout'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ready = useAuthGuard('auth')
  if (!ready) return null

  return <Layout>{children}</Layout>
}
