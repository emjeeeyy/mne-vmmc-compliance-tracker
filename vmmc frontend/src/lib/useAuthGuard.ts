'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, requiresPasswordChange } from './auth'

/**
 * Auth is sessionStorage-based (client-only), so the check can't run on the
 * server. Renders nothing until the client-side check redirects or clears.
 */
export function useAuthGuard(mode: 'auth' | 'guest') {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const authed = isAuthenticated()
    if (mode === 'auth' && !authed) {
      router.replace('/login')
      return
    }
    if (mode === 'auth' && authed && requiresPasswordChange()) {
      router.replace('/first-login')
      return
    }
    if (mode === 'guest' && authed) {
      router.replace(requiresPasswordChange() ? '/first-login' : '/dashboard')
      return
    }
    setReady(true)
  }, [mode, router])

  return ready
}
