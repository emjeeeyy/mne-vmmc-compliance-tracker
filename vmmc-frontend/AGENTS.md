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
- `src/app/(dashboard)/layout.tsx` - Auth-guarded shell (top bar + sidebar) wrapping dashboard/compliance/upload/profile
- `src/screens/*.tsx` - Screen implementations (rendered by the thin route pages under `src/app`)
- `src/components/Layout.tsx` - App chrome (header + sidebar nav)
- `src/lib/auth.ts` - sessionStorage-based auth helpers
- `src/lib/useAuthGuard.ts` - Client-side redirect guard (`'auth'` | `'guest'` modes) used by protected/guest routes
- `src/app/globals.css` - Global styles and Tailwind CSS import
- `next.config.ts` - Next.js configuration

## Auth model

Auth is a client-only `sessionStorage` flag (`vmmc_auth`) — there's no backend/session cookie yet. Because of this, protected routes and the login route are client components that check auth in `useEffect` (via `useAuthGuard`) and redirect; they intentionally render `null` until that check resolves, matching the original SPA's client-only behavior.

## Styling

This project uses **Tailwind CSS v4**, loaded via `@tailwindcss/postcss` (`postcss.config.mjs`) — but styling responsibility is deliberately split: inline `style={{}}` objects (carried over from the original Figma Make output) own all visual properties (colors, fonts, spacing, shadows), and Tailwind `className` is used **only** for responsive/breakpoint behavior. See [FRONTEND_STANDARDS.md](FRONTEND_STANDARDS.md) for the full convention, the color palette, component patterns, and the gotchas that come from mixing the two mechanisms on one property.
