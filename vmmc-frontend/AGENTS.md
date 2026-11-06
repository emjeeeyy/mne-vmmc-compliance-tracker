# vmmc-frontend

Next.js (App Router) + Tailwind CSS project. Originally generated in Figma Make as a Vite SPA; migrated to Next.js.

@FRONTEND_STANDARDS.md

**Read [FRONTEND_STANDARDS.md](FRONTEND_STANDARDS.md) before making any UI/UX change.** It documents the established design system, styling conventions, responsive-breakpoint rules, and recurring gotchas for this codebase — apply it by default instead of asking what the design/pattern should be.

## Development Server

Not always-on — start it yourself:

```
npm run dev
```

Runs on `$PORT` (default 3000, honored automatically by the Next.js CLI). Hot reload via Turbopack.

## Key Files

- `src/app/layout.tsx` - Root layout (html/body shell, global metadata)
- `src/app/page.tsx` - `/` route; client-redirects to `/dashboard` or `/login` based on auth
- `src/app/login/page.tsx` - Login route
- `src/app/privacy/page.tsx` - Privacy notice, including the essential session-cookie explanation
- `src/app/(dashboard)/layout.tsx` - Auth-guarded shell (single top header band, no sidebar) wrapping dashboard/compliance/upload/profile/notifications
- `src/screens/*.tsx` - Screen implementations (rendered by the thin route pages under `src/app`)
- `src/components/CookieNotice.tsx` - App-wide notice for the essential HttpOnly session cookie
- `src/components/Layout.tsx` - App chrome: one gradient header band with inline nav (xl+), hamburger dropdown below xl, bottom tab bar on phones
- `src/lib/auth.ts` - sessionStorage-based auth helpers
- `src/lib/useAuthGuard.ts` - Client-side redirect guard (`'auth'` | `'guest'` modes) used by protected/guest routes
- `src/app/globals.css` - Global styles and Tailwind CSS import
- `next.config.ts` - Next.js configuration

## Auth model

The access token is stored in the backend-issued HttpOnly `vmmc_session` cookie and sent automatically with API requests using `credentials: 'include'`. `sessionStorage` contains only a non-secret UI session shell used by `useAuthGuard`; it is not the credential or the backend authorization boundary. The root layout renders the essential-cookie notice on every route. Signup links to `/privacy` and requires an unchecked-by-default acknowledgment before calling the existing signup endpoint. Keep the notice factual: the app has no optional analytics or advertising cookies, and DPO-approved retention/controller/contact details still need confirmation in the privacy notice before official publication.

## Styling

This project uses **Tailwind CSS v4**, loaded via `@tailwindcss/postcss` (`postcss.config.mjs`) — but styling responsibility is deliberately split: inline `style={{}}` objects (carried over from the original Figma Make output) own all visual properties (colors, fonts, spacing, shadows), and Tailwind `className` is used **only** for responsive/breakpoint behavior. See [FRONTEND_STANDARDS.md](FRONTEND_STANDARDS.md) for the full convention, the color palette, component patterns, and the gotchas that come from mixing the two mechanisms on one property.
