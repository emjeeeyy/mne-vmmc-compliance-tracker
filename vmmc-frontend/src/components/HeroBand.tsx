'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, type LucideIcon } from 'lucide-react'
import { fadeRise } from '@/lib/motion'

export interface HeroChip { icon: LucideIcon; text: string }

/** The gradient band at the top of the staff and admin landing pages. It continues the header's own
 * gradient, so the two read as one unbroken band; callers wrap it in the negative-margin breakout that
 * cancels <main>'s padding. Side margins are the mockup's own proportion (22/820 of its frame), not a
 * centered max-width column. */
export default function HeroBand({ title, description, chips }: { title: ReactNode; description: string; chips: HeroChip[] }) {
  return (
    <div style={{ background: 'linear-gradient(90deg, #1b2a47 0%, #265d4c 100%)', color: '#fff' }}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-10 lg:gap-[2.8vw] items-center px-6 lg:px-[2.7vw]"
        style={{ paddingTop: 'clamp(16px, 1.6vw, 36px)', paddingBottom: 'clamp(32px, 3.8vw, 80px)' }}
      >
        <motion.div custom={0} variants={fadeRise} initial="hidden" animate="visible">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 24, padding: '0 12px 0 8px', borderRadius: 999, background: '#265e4c', border: '1px solid rgba(128,212,170,0.22)', color: '#94e7d5', fontSize: 11, fontWeight: 500 }}>
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#e1a13c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={8} color="#265e4c" strokeWidth={4} />
            </span>
            The #1 hospital for our nation&apos;s heroes
          </span>
          <h1 style={{ fontSize: 'clamp(28px, 2.57vw, 60px)', fontWeight: 700, lineHeight: 1.19, margin: 'clamp(20px, 2.6vw, 56px) 0 0', letterSpacing: '-0.005em' }}>{title}</h1>
          <p style={{ fontSize: 'clamp(13px, 0.92vw, 19px)', lineHeight: 1.55, color: '#c3cbd6', maxWidth: '32em', margin: '16px 0 0' }}>{description}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>
            {chips.map(({ icon: Icon, text }) => (
              <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#b9c1cd', fontSize: 12, fontWeight: 500 }}>
                <Icon size={17} color="#80d4aa" fill="#80d4aa" aria-hidden="true" /> {text}
              </span>
            ))}
          </div>
        </motion.div>
        <motion.div custom={1} variants={fadeRise} initial="hidden" animate="visible" className="hidden lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vmmc_building.png" alt="Veterans Memorial Medical Center" style={{ display: 'block', width: '100%', aspectRatio: '760 / 300', objectFit: 'cover', borderRadius: 16 }} />
        </motion.div>
      </div>
    </div>
  )
}
