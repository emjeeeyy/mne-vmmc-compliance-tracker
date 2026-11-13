/** The reviewer's reading of an uploaded document. The staff member no longer enters results: the reviewer reads the
 * file and records the result when approving, so these are the values the Document Verification window collects. */

export interface ReviewResults {
  cxr: '' | 'CLEARED' | 'INFILTRATE'
  genexpert: '' | 'NOT_DETECTED' | 'DETECTED'
  titer: '' | 'REACTIVE' | 'NON_REACTIVE'
}

/** What a queue row carries (the backend's three result columns). NOT_APPLICABLE and PENDING both mean "nothing recorded". */
interface QueueResults {
  cxrResult: string
  genexpertResult: string
  titerResult: string
}

export const EMPTY_RESULTS: ReviewResults = { cxr: '', genexpert: '', titer: '' }

const pick = <T extends string>(value: string, allowed: readonly T[]): T | '' => ((allowed as readonly string[]).includes(value) ? (value as T) : '')

/** Starting values for the window: whatever the row already holds. Older uploads carry the staff member's own entry,
 * which becomes a pre-fill the reviewer confirms or corrects; new uploads start empty. */
export function initialResults(item: QueueResults): ReviewResults {
  return {
    cxr: pick(item.cxrResult, ['CLEARED', 'INFILTRATE'] as const),
    genexpert: pick(item.genexpertResult, ['NOT_DETECTED', 'DETECTED'] as const),
    titer: pick(item.titerResult, ['REACTIVE', 'NON_REACTIVE'] as const),
  }
}

export function hasPrefill(r: ReviewResults): boolean {
  return Boolean(r.cxr || r.genexpert || r.titer)
}

/** What must be filled in before the reviewer can approve, or null when it is complete. Mirrors the backend rule:
 * an annual physical exam needs the chest X-ray or GeneXpert; a Hep B titer needs the titer. */
export function reviewResultError(docType: string, r: ReviewResults): string | null {
  if (docType === 'HEPB_TITER') return r.titer ? null : 'Record the Hep B titer result before approving.'
  return r.cxr || r.genexpert ? null : 'Record the chest X-ray or GeneXpert result before approving.'
}

/** Only the fields that belong to the document's category, and only the ones filled in: the backend refuses a result
 * from the wrong category instead of ignoring it. */
export function resultPayload(docType: string, r: ReviewResults): { cxrResult?: string; genexpertResult?: string; titerResult?: string } {
  if (docType === 'HEPB_TITER') return r.titer ? { titerResult: r.titer } : {}
  return { ...(r.cxr ? { cxrResult: r.cxr } : {}), ...(r.genexpert ? { genexpertResult: r.genexpert } : {}) }
}
