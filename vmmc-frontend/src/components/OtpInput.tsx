'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { activeOtpIndex, sanitizeOtp } from '@/lib/otp'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  /** Visible label above the boxes. Set `labelHidden` to keep it for screen readers only. */
  label?: string
  labelHidden?: boolean
  /** Turns the boxes red and moves focus back, e.g. after a wrong code. */
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  onEnter?: () => void
}

/** A verification-code field drawn as one box per digit. Underneath it is a single real text input, not six: that is
 * what lets a pasted or auto-filled code land in one go, makes Backspace behave, and gives a screen reader one field
 * with one label instead of six unlabeled ones. The boxes are only the picture of what that input holds. */
export default function OtpInput({ value, onChange, length = 6, label = 'Verification code', labelHidden, invalid, disabled, autoFocus, onEnter }: Readonly<OtpInputProps>) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const active = activeOtpIndex(value, length)
  const groupBreak = length === 6 ? 3 : -1

  useEffect(() => {
    if (invalid) inputRef.current?.focus()
  }, [invalid])

  // Park the caret at the end when the field is entered or clicked: the boxes can only show "digits so far", so a caret
  // in the middle would look wrong. A real selection (Ctrl+A, then type to replace) is left alone.
  const caretToEnd = (el: HTMLInputElement) => {
    if (el.selectionStart === el.selectionEnd) el.setSelectionRange(el.value.length, el.value.length)
  }

  return (
    <div>
      <label htmlFor={id} className={labelHidden ? 'sr-only' : undefined} style={labelHidden ? undefined : { display: 'block', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3151', marginBottom: 10, textAlign: 'center' }}>
        {label}
      </label>
      <style>{`
        @keyframes vmmc-otp-caret { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        .vmmc-otp-caret { animation: vmmc-otp-caret 1.1s steps(1) infinite }
        @media (prefers-reduced-motion: reduce) { .vmmc-otp-caret { animation: none } }
      `}</style>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const isActive = focused && !disabled && i === active
          let border = '#7b8798'
          if (invalid) border = '#b42318'
          else if (isActive) border = '#00703f'
          return (
            <div
              key={i}
              aria-hidden="true"
              style={{
                flex: '1 1 0', minWidth: 34, maxWidth: 50, height: 56, marginLeft: i === groupBreak ? 10 : 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                border: `${isActive || invalid ? 2 : 1}px solid ${border}`, borderRadius: 10,
                background: disabled ? '#f1f5f9' : '#fff', boxShadow: isActive ? '0 0 0 3px rgba(0,112,63,0.18)' : 'none',
                fontFamily: 'Poppins,sans-serif', fontSize: 24, fontWeight: 700, color: '#1f3151', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {value[i] ?? (isActive ? <span className="vmmc-otp-caret" style={{ width: 2, height: 26, background: '#1f3151', borderRadius: 1 }} /> : null)}
            </div>
          )
        })}
        <input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(sanitizeOtp(e.target.value, length))}
          onFocus={(e) => { setFocused(true); caretToEnd(e.currentTarget) }}
          onBlur={() => setFocused(false)}
          onClick={(e) => caretToEnd(e.currentTarget)}
          onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          // No maxLength on purpose: the browser would cut a pasted "482 913" to "482 91" before sanitizeOtp could strip
          // the space, losing the last digit. sanitizeOtp enforces the length instead.
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'text', fontSize: 16, caretColor: 'transparent', border: 0, padding: 0, background: 'transparent' }}
        />
      </div>
    </div>
  )
}
