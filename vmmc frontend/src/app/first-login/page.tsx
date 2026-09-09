'use client'

import FirstLoginReset from '@/screens/FirstLoginReset'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function FirstLoginPage() {
  const ready = useAuthGuard('auth')
  if (!ready) return null

  return <FirstLoginReset />
}
