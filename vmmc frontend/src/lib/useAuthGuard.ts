'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, requiresPasswordChange } from './auth'

/**
 * Auth is sessionStorage-based (client-only), so the check can't run on the
 * server. Renders nothing until the client-side check redirects or clears.
 */
export function useAuthGuard(mode: 'auth' | 'guest' | 'first-login') {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const authed = isAuthenticated()
    if ((mode === 'auth' || mode === 'first-login') && !authed) {
      router.replace('/login')
      return
    }
    if (mode === 'auth' && authed && requiresPasswordChange()) {
      router.replace('/first-login')
      return
    }
    // The first-login page IS where a pending password change is supposed to be handled —
    // reusing 'auth's redirect rule here would send it to itself and never call setReady(),
    // permanently blanking the page. It only redirects away once there's nothing left to do.
    if (mode === 'first-login' && authed && !requiresPasswordChange()) {
      router.replace('/dashboard')
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
