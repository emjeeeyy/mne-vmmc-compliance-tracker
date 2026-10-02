'use client'

import Login from '@/screens/Login'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function LoginPage() {
  const ready = useAuthGuard('guest')
  if (!ready) return null

  return <Login />
}
