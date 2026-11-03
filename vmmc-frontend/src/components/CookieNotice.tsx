'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'vmmc_cookie_notice_dismissed'

export default function CookieNotice() {
  const [visible, setVisible] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    setVisible(sessionStorage.getItem(DISMISSED_KEY) !== 'true')
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside
      aria-label="Essential cookie notice"
      style={{
        position: 'fixed',
        zIndex: 1000,
        left: 16,
        right: 16,
        bottom: 16,
        maxWidth: 720,
        margin: '0 auto',
        padding: 18,
        background: '#fff',
        border: '1px solid #d8e2eb',
        borderRadius: 12,
        boxShadow: '0 12px 36px rgba(17, 35, 54, 0.18)',
        color: '#24364b',
        fontFamily: 'Public Sans,sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 700, color: '#1f3151' }}>
            Essential cookie notice
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: '#4a5568' }}>
            This app uses a necessary session cookie after sign-in to keep authenticated requests secure. It is not used for advertising.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss cookie notice"
          title="Dismiss"
          style={{ flex: '0 0 44px', width: 44, height: 44, margin: -8, border: 0, borderRadius: 8, background: 'transparent', color: '#40546b', cursor: 'pointer', fontSize: 22 }}
        >
          ×
        </button>
      </div>

      {detailsOpen && (
        <div style={{ marginTop: 12, padding: 12, background: '#f4f7f6', borderRadius: 8, fontSize: 12, lineHeight: 1.6, color: '#40546b' }}>
          The <code>vmmc_session</code> cookie is HttpOnly, so page scripts cannot read its value. Your browser sends it to the API while you are signed in; it uses SameSite=Lax and Secure in production. The notice dismissal is kept in this tab's session storage and does not create another cookie. No optional analytics or advertising cookies are used by this app.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            style={{ minHeight: 44, padding: '0 4px', border: 0, background: 'transparent', color: '#1d3d93', fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
          >
            {detailsOpen ? 'Hide details' : 'Cookie details'}
          </button>
          <Link href="/privacy#cookies" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: '#1d3d93', fontSize: 13, fontWeight: 600 }}>
            Privacy notice
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          style={{ minHeight: 44, padding: '0 18px', border: 0, borderRadius: 8, background: '#1f3151', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Got it
        </button>
      </div>
    </aside>
  )
}