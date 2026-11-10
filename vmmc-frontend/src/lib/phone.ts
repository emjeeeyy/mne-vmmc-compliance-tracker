/** Philippine mobile numbers: the field shows a fixed "+63" and the person types only the 10 digits after it
 * (9XXXXXXXXX). A leading 0 (09171234567) or a pasted country code (+63 917..., 63917...) is dropped, so the
 * stored value is always the international form +639XXXXXXXXX, which is what the backend's @IsPhoneNumber()
 * requires (it rejects a bare 09... number). */

export const PH_COUNTRY_CODE = '+63'
export const PH_NATIONAL_LENGTH = 10

/** Whatever was typed, pasted or loaded from the server, reduced to the digits after +63 (at most 10).
 * A national mobile number never starts with 0 or 63 (they start with 9), so both are safe to strip. */
export function toNationalDigits(raw: string): string {
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  // "63" only counts as a country code when it is clearly one: typed with a "+", or too long to be a national number.
  if (digits.startsWith('63') && (trimmed.startsWith('+') || digits.length > PH_NATIONAL_LENGTH)) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, PH_NATIONAL_LENGTH)
}

/** The value to keep and send: "+63" + the national digits, or '' when nothing has been typed. */
export function toE164(raw: string): string {
  const national = toNationalDigits(raw)
  return national ? `${PH_COUNTRY_CODE}${national}` : ''
}

/** Complete and plausible: exactly 10 digits, starting with 9 (every PH mobile number does). */
export function isValidPhMobile(raw: string): boolean {
  return /^9\d{9}$/.test(toNationalDigits(raw))
}
