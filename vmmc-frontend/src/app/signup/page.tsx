'use client'

import Signup from '@/screens/Signup'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function SignupPage() {
  const ready = useAuthGuard('guest')
  if (!ready) return null

  return <Signup />
}
