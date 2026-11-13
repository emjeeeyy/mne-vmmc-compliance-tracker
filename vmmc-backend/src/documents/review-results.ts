import { BadRequestException } from '@nestjs/common';

/** The three result columns on a `documents` row. 'NOT_APPLICABLE' means "no result recorded for this test". */
export interface DocumentResults {
  cxr_result: string;
  genexpert_result: string;
  titer_result: string;
}

export interface ReviewResultsInput {
  cxrResult?: string;
  genexpertResult?: string;
  titerResult?: string;
}

const NOT_APPLICABLE = 'NOT_APPLICABLE';

/**
 * The results a reviewer records when approving a document. The reviewer reads the uploaded file; the staff member
 * no longer has to (and cannot be trusted to) interpret it, so approving is where a result enters the system, and
 * what is written here is what drives the clinical alert (see EventClassifierService).
 *
 * Same rules the upload used to enforce on the staff member: an annual physical exam needs at least one of the
 * chest X-ray or GeneXpert results; a Hep B titer needs the titer. A result that does not belong to the document's
 * category is refused rather than silently ignored, so a mistake is visible.
 */
export function resolveReviewResults(docType: string, input: ReviewResultsInput): DocumentResults {
  if (docType === 'HEPB_TITER') {
    if (input.cxrResult || input.genexpertResult) {
      throw new BadRequestException('A chest X-ray or GeneXpert result does not apply to a Hep B titer.');
    }
    if (!input.titerResult) {
      throw new BadRequestException('Record the Hep B titer result (REACTIVE or NON_REACTIVE) before approving.');
    }
    return { cxr_result: NOT_APPLICABLE, genexpert_result: NOT_APPLICABLE, titer_result: input.titerResult };
  }

  if (input.titerResult) {
    throw new BadRequestException('A Hep B titer result does not apply to an annual physical exam.');
  }
  if (!input.cxrResult && !input.genexpertResult) {
    throw new BadRequestException('Record at least one result before approving: the chest X-ray or GeneXpert.');
  }
  return {
    cxr_result: input.cxrResult ?? NOT_APPLICABLE,
    genexpert_result: input.genexpertResult ?? NOT_APPLICABLE,
    titer_result: NOT_APPLICABLE,
  };
}

const FIELD_LABELS: { key: keyof DocumentResults; label: string }[] = [
  { key: 'cxr_result', label: 'Chest X-ray' },
  { key: 'genexpert_result', label: 'GeneXpert' },
  { key: 'titer_result', label: 'Hep B titer' },
];

const readable = (value: string) => (value === NOT_APPLICABLE ? 'not recorded' : value.replace(/_/g, ' ').toLowerCase());

/**
 * A line for the review notes when the reviewer changed something the staff member had already entered (older
 * uploads carry the staff member's own entry as a pre-fill). Nothing is said when there was no entry or it was
 * confirmed as it stood, so a normal approval adds nothing. Keeps a correction from being a silent overwrite.
 */
export function describeResultCorrections(before: DocumentResults, after: DocumentResults): string | null {
  const changes = FIELD_LABELS.filter(({ key }) => before[key] !== NOT_APPLICABLE && before[key] !== after[key]).map(
    ({ key, label }) => `${label} ${readable(before[key])} -> ${readable(after[key])}`,
  );
  return changes.length > 0 ? `Result corrected at review (staff entered: ${changes.join('; ')}).` : null;
}
