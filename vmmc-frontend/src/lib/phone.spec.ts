import { describe, expect, it } from 'vitest'
import { isValidPhMobile, toE164, toNationalDigits } from './phone'

describe('toNationalDigits', () => {
  it.each([
    ['9171234567', '9171234567'],
    ['09171234567', '9171234567'], // the leading 0 is dropped
    ['0917 123 4567', '9171234567'],
    ['+639171234567', '9171234567'],
    ['+63 917 123 4567', '9171234567'],
    ['639171234567', '9171234567'],
    ['0', ''], // a lone leading 0 vanishes as it is typed
    ['', ''],
    ['abc', ''],
  ])('cleans %j', (raw, expected) => expect(toNationalDigits(raw)).toBe(expected))

  it('never returns more than 10 digits', () => expect(toNationalDigits('917123456789')).toBe('9171234567'))

  it('does not eat a "63" that is just the start of a short number being typed', () => {
    expect(toNationalDigits('63')).toBe('63')
    expect(toNationalDigits('6391')).toBe('6391')
  })

  it('is stable: cleaning an already-clean value changes nothing', () => {
    const once = toNationalDigits('+63 917 123 4567')
    expect(toNationalDigits(once)).toBe(once)
  })
})

describe('toE164', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
    ['917', '+63917'], // partial while typing
  ])('%j becomes %j', (raw, expected) => expect(toE164(raw)).toBe(expected))

  it('stays empty when nothing is typed, so no bare "+63" is ever saved', () => {
    expect(toE164('')).toBe('')
    expect(toE164('0')).toBe('')
  })

  it('round-trips: a stored +63 value reloads into the same number', () => {
    expect(toE164(toE164('09171234567'))).toBe('+639171234567')
  })
})

describe('isValidPhMobile', () => {
  it.each(['9171234567', '09171234567', '+639171234567', '+63 917 123 4567'])('accepts %j', raw => expect(isValidPhMobile(raw)).toBe(true))
  it.each(['', '917123456', '8171234567', '0', '+63'])('rejects %j', raw => expect(isValidPhMobile(raw)).toBe(false))
})
