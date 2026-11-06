/** Keep only digits, capped at the code length. Whatever arrives (typing, a paste like "123 456" or "123-456",
 * or an autofill) ends up as a clean run of digits. */
export function sanitizeOtp(raw: string, length = 6): string {
  return raw.replace(/\D/g, '').slice(0, length)
}

/** Which of the `length` boxes shows the caret: the next empty one, or the last one once the code is full. */
export function activeOtpIndex(value: string, length = 6): number {
  return Math.min(value.length, length - 1)
}
