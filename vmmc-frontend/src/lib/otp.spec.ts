import { describe, expect, it } from 'vitest'
import { activeOtpIndex, sanitizeOtp } from './otp'

describe('sanitizeOtp', () => {
  it('keeps digits only', () => expect(sanitizeOtp('12a3b4')).toBe('1234'))
  it.each([
    ['123 456', '123456'],
    ['123-456', '123456'],
    [' 123456\n', '123456'],
  ])('cleans a pasted code %j', (raw, expected) => expect(sanitizeOtp(raw)).toBe(expected))
  it('never returns more digits than the code length', () => {
    expect(sanitizeOtp('12345678')).toBe('123456')
    expect(sanitizeOtp('12345678', 4)).toBe('1234')
  })
  it('an empty or non-numeric entry becomes empty', () => {
    expect(sanitizeOtp('')).toBe('')
    expect(sanitizeOtp('abc')).toBe('')
  })
})

describe('activeOtpIndex', () => {
  it('points at the next empty box', () => {
    expect(activeOtpIndex('')).toBe(0)
    expect(activeOtpIndex('123')).toBe(3)
  })
  it('stays on the last box once the code is complete', () => expect(activeOtpIndex('123456')).toBe(5))
})
