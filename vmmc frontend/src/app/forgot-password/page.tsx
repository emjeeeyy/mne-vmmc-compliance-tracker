'use client'

import ForgotPassword from '@/screens/ForgotPassword'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function ForgotPasswordPage() {
  const ready = useAuthGuard('guest')
  if (!ready) return null

  return <ForgotPassword />
}
