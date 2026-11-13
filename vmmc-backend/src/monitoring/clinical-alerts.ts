/** An approved document of the current cycle, as the clinical check needs it. */
export interface ApprovedDocument {
  id: string;
  cxr_result: string;
  genexpert_result: string;
  reviewed_at: string | null;
}

/** An existing CLINICAL_ALERT event on the record. `payload` carries the ids of the documents it was raised for. */
export interface ClinicalAlertEvent {
  detected_at: string;
  payload?: { sourceId?: string; sourceIds?: string[] } | null;
}

export function isPositiveResult(doc: Pick<ApprovedDocument, 'cxr_result' | 'genexpert_result'>): boolean {
  return doc.cxr_result === 'INFILTRATE' || doc.genexpert_result === 'DETECTED';
}

function alertCovers(alert: ClinicalAlertEvent, doc: ApprovedDocument): boolean {
  const ids = [alert.payload?.sourceId, ...(alert.payload?.sourceIds ?? [])].filter((id): id is string => Boolean(id));
  if (ids.length > 0) return ids.includes(doc.id);
  // An alert raised before alerts carried document ids (all the ones sent so far) covers every document approved
  // before it was sent: it was raised right after that approval.
  return doc.reviewed_at !== null && Date.parse(alert.detected_at) >= Date.parse(doc.reviewed_at);
}

/**
 * Every positive approved document gets exactly one alert, whether or not the person is already cleared. A document
 * needs one when no existing alert on the record was raised for it. Pure, so the rule is tested directly.
 *
 * This replaces "one alert per record", which ignored a later positive result once the record had been cleared (the
 * classifier returned early for COMPLIANT records) and also once any earlier alert existed (so a new positive result,
 * after the first one was dealt with, never reached the unit head).
 */
export function documentsNeedingClinicalAlert(docs: ApprovedDocument[], alerts: ClinicalAlertEvent[]): ApprovedDocument[] {
  return docs.filter((doc) => isPositiveResult(doc) && !alerts.some((alert) => alertCovers(alert, doc)));
}
