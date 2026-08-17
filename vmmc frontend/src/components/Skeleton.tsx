'use client'

import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'

/** Pulsing placeholder block — the shared building block for all skeleton loading states.
 * Uses framer-motion (not Tailwind's animate-pulse) to match this app's established
 * convention: visual styling lives in inline style, Tailwind className is breakpoint-only. */
export function SkeletonBlock({ width = '100%', height = 16, radius = 8, style = {} }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width, height, borderRadius: radius, background: '#e2e8f0', flexShrink: 0, ...style }}
    />
  )
}

/** Matches this app's dominant list-row shape (icon/avatar box + title + meta line + trailing badge) —
 * see FRONTEND_STANDARDS.md section 5. Reused for any staff-directory-style list. */
export function SkeletonListRow({ avatarShape = 'circle' }: { avatarShape?: 'circle' | 'square' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, background: '#f8fafc', marginBottom: 12 }}>
      <SkeletonBlock width={48} height={48} radius={avatarShape === 'circle' ? 999 : 12} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SkeletonBlock width="45%" height={14} />
        <SkeletonBlock width="30%" height={11} />
      </div>
      <SkeletonBlock width={72} height={24} radius={999} />
    </div>
  )
}

/** A generic rounded card placeholder — for stat cards, summary cards, chart panels, etc. */
export function SkeletonCard({ height = 120, style = {} }: { height?: number | string; style?: CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', ...style }}>
      <SkeletonBlock width="40%" height={11} style={{ marginBottom: 14 }} />
      <SkeletonBlock width="60%" height={22} style={{ marginBottom: 10 }} />
      <SkeletonBlock width="100%" height={height} radius={12} />
    </div>
  )
}

/** Matches this app's bordered staff-record card shape (Compliance.tsx's StaffCard) —
 * name/dept header, id/role lines, two status rows, footer row. */
export function SkeletonStaffCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', padding: '32px 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <SkeletonBlock width="55%" height={20} />
        <SkeletonBlock width={60} height={20} radius={999} />
      </div>
      <SkeletonBlock width="35%" height={13} style={{ marginBottom: 20 }} />
      <SkeletonBlock height={38} radius={12} style={{ marginBottom: 12, background: '#f1f5f9' }} />
      <SkeletonBlock height={38} radius={12} style={{ marginBottom: 24, background: '#f1f5f9' }} />
      <SkeletonBlock width="50%" height={14} />
    </div>
  )
}
