'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const DISMISSED_KEY = 'vmmc_cookie_notice_dismissed'

/** Pages with no app header/tab bar (the document itself scrolls on these). Everything else is inside the app shell. */
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/first-login', '/privacy']

/* Where it sits, so it never covers a control the person has to press:
   - desktop (>= 640px): a compact card in the bottom-left corner. The sign-in and signup cards are centered, so on a
     laptop they never reach it;
   - phone (< 640px) inside the app: raised above the fixed bottom tab bar (12px gap + ~60px bar + 16px margin);
   - phone/tablet on a public page: bottom of the screen, and the page is given matching bottom padding (see the effect
     below), so a button underneath can always be scrolled clear of it. */
const CSS = `
.vmmc-cookie-notice { position: fixed; z-index: 1000; left: 12px; right: 12px; bottom: 12px; max-width: 520px; margin: 0 auto; }
.vmmc-cookie-notice[data-area="app"] { bottom: 92px; }
@media (min-width: 640px) {
  .vmmc-cookie-notice { left: 16px; right: auto; bottom: 16px; width: 360px; margin: 0; }
  .vmmc-cookie-notice[data-area="app"] { bottom: 16px; }
}
`

export default function CookieNotice() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const noticeRef = useRef<HTMLElement>(null)
  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  useEffect(() => {
    setVisible(sessionStorage.getItem(DISMISSED_KEY) !== 'true')
  }, [])

  // On a public page narrower than a laptop the notice can sit over the page's own buttons. Reserve room under the
  // content while it is showing, so the page can always be scrolled until the button is clear of the notice.
  useEffect(() => {
    if (!visible || !isPublic) return
    const el = noticeRef.current
    const apply = () => {
      const narrow = window.matchMedia('(max-width: 1099px)').matches
      document.body.style.paddingBottom = narrow && el ? `${el.offsetHeight + 28}px` : ''
    }
    apply()
    window.addEventListener('resize', apply)
    const observer = new ResizeObserver(apply)
    if (el) observer.observe(el)
    return () => {
      window.removeEventListener('resize', apply)
      observer.disconnect()
      document.body.style.paddingBottom = ''
    }
  }, [visible, isPublic])

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      <style>{CSS}</style>
      <aside
        ref={noticeRef}
        className="vmmc-cookie-notice"
        data-area={isPublic ? 'public' : 'app'}
        aria-label="Essential cookie notice"
        style={{
          padding: 16,
          background: '#fff',
          border: '1px solid #d8e2eb',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(17, 35, 54, 0.18)',
          color: '#24364b',
          fontFamily: 'Public Sans,sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'Poppins,sans-serif', fontSize: 15, fontWeight: 700, color: '#1f3151' }}>
              Essential cookie notice
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: '#4a5568' }}>
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
          <div style={{ marginTop: 10, padding: 12, background: '#f4f7f6', borderRadius: 8, fontSize: 12, lineHeight: 1.6, color: '#40546b' }}>
            The <code>vmmc_session</code> cookie is HttpOnly, so page scripts cannot read its value. Your browser sends it to the API while you are signed in; it uses SameSite=Lax and Secure in production. The notice dismissal is kept in this tab&apos;s session storage and does not create another cookie. No optional analytics or advertising cookies are used by this app.
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
    </>
  )
}
