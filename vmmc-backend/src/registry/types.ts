import type { ClinicalStatus, ComplianceState, CxrResult, GeneXpertResult } from '../compliance/types';

/** One word for "how is this person doing on this module", shared by all four registry tabs.
 * NO_RECORD is its own state rather than being folded into OVERDUE: most staff simply have
 * nothing recorded yet for the smaller modules, which is not the same as being late. */
export type RegistryBucket = 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE' | 'NO_RECORD';

export interface RegistryPerson {
  /** employees.id — what the per-employee tracking endpoints (/pep-logs/:id, …) take. */
  id: string;
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  department: { name: string; code: string };
}

export interface ApeRegistryRow extends RegistryPerson {
  bucket: RegistryBucket;
  status: ComplianceState;
  clinicalStatus: ClinicalStatus;
  /** Most recent approved APE exam in ANY cycle (the tracker only knows the current cycle's). */
  lastExamDate: string | null;
  cxrResult: CxrResult;
  genexpertResult: GeneXpertResult;
  /** Current cycle's deadline while it is open; the following year's once this cycle is cleared. */
  nextDueDate: string;
  /** True only when a certificate can truthfully be issued (cleared this cycle, not CRITICAL). */
  certificateAvailable: boolean;
}

export interface PreEmploymentRegistryRow extends RegistryPerson {
  bucket: RegistryBucket;
  screeningResult: string | null;
  fitForDuty: boolean;
  clearedAt: string | null;
  hasRecord: boolean;
}

export interface PepRegistryEntry {
  id: string;
  exposureDate: string;
  exposureType: string;
  prophylaxisStatus: string;
  followUpDate: string | null;
}

export interface PepRegistryRow extends RegistryPerson {
  bucket: RegistryBucket;
  /** Logs that haven't reached COMPLETED / DECLINED yet. */
  activeCount: number;
  /** The log that decides the row: the earliest-follow-up active one, else the most recent. */
  latest: PepRegistryEntry | null;
}

export interface ImmunizationDoseEntry {
  vaccineType: string;
  dose: number;
  administeredDate: string;
  nextDueDate: string | null;
}

export interface ImmunizationRegistryRow extends RegistryPerson {
  bucket: RegistryBucket;
  /** Most recently administered dose of anything. */
  latest: ImmunizationDoseEntry | null;
  /** The dose that is driving an OVERDUE / DUE_SOON bucket, if any. */
  attention: ImmunizationDoseEntry | null;
  bcgDate: string | null;
}

export interface ClearanceCertificate {
  employee: { fullName: string; employeeId: string; jobTitle: string | null; department: string };
  cxrResult: CxrResult;
  genexpertResult: GeneXpertResult;
  examDate: string | null;
  issuedAt: string;
  validUntil: string;
  signatory: { fullName: string; jobTitle: string | null; signatureUrl: string | null };
}
