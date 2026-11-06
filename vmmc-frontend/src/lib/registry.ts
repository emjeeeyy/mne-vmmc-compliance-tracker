/** Types and pure helpers for the admin Modules Registry (GET /registry/*). Kept out of the screen so the
 * wording and filtering rules are unit-tested rather than trusted by eye. */

export type RegistryBucket = 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE' | 'NO_RECORD'
export type StatusFilter = 'ALL' | RegistryBucket

export interface RegistryPerson {
  id: string
  employeeId: string
  fullName: string
  jobTitle: string | null
  department: { name: string; code: string }
}

export type CxrResult = 'CLEARED' | 'INFILTRATE' | 'PENDING' | 'NOT_APPLICABLE'
export type GeneXpertResult = 'NOT_DETECTED' | 'DETECTED' | 'PENDING' | 'NOT_APPLICABLE'

export interface ApeRow extends RegistryPerson {
  bucket: RegistryBucket
  status: 'COMPLIANT' | 'PENDING' | 'NON_COMPLIANT' | 'OVERDUE'
  clinicalStatus: 'COMPLIANT' | 'CRITICAL' | 'PENDING'
  lastExamDate: string | null
  cxrResult: CxrResult
  genexpertResult: GeneXpertResult
  nextDueDate: string
  certificateAvailable: boolean
}

export interface PreEmploymentRow extends RegistryPerson {
  bucket: RegistryBucket
  screeningResult: string | null
  fitForDuty: boolean
  clearedAt: string | null
  hasRecord: boolean
}

export interface PepEntry {
  id: string
  exposureDate: string
  exposureType: string
  prophylaxisStatus: string
  followUpDate: string | null
}

export interface PepRow extends RegistryPerson {
  bucket: RegistryBucket
  activeCount: number
  latest: PepEntry | null
}

export interface DoseEntry {
  vaccineType: string
  dose: number
  administeredDate: string
  nextDueDate: string | null
}

export interface ImmunizationRow extends RegistryPerson {
  bucket: RegistryBucket
  latest: DoseEntry | null
  attention: DoseEntry | null
  bcgDate: string | null
}

export interface ClearanceCertificate {
  employee: { fullName: string; employeeId: string; jobTitle: string | null; department: string }
  cxrResult: CxrResult
  genexpertResult: GeneXpertResult
  examDate: string | null
  issuedAt: string
  validUntil: string
  signatory: { fullName: string; jobTitle: string | null; signatureUrl: string | null }
}

export const BUCKET_LABEL: Record<RegistryBucket, string> = {
  UP_TO_DATE: 'Up to Date / Cleared',
  DUE_SOON: 'Upcoming / Due Soon',
  OVERDUE: 'Action Required / Overdue',
  NO_RECORD: 'No Record',
}

/** Shorter wording for the passport card pills, which are narrower than the table's. */
export const BUCKET_SHORT: Record<RegistryBucket, string> = {
  UP_TO_DATE: 'Up to Date',
  DUE_SOON: 'Due Soon',
  OVERDUE: 'Action Required',
  NO_RECORD: 'No Record',
}

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { ALL: 'All Statuses', ...BUCKET_LABEL }

/** Name, Employee ID and department (name or code) — the three things the search box promises. */
export function matchesSearch(row: RegistryPerson, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return [row.fullName, row.employeeId, row.department.name, row.department.code].some((v) => v.toLowerCase().includes(q))
}

export function filterRows<T extends RegistryPerson & { bucket: RegistryBucket }>(rows: T[], search: string, status: StatusFilter): T[] {
  return rows.filter((r) => (status === 'ALL' || r.bucket === status) && matchesSearch(r, search))
}

export function cxrText(result: CxrResult, hasExam: boolean): string {
  if (result === 'CLEARED') return 'Cleared'
  if (result === 'INFILTRATE') return 'Infiltrate noted'
  if (result === 'PENDING') return 'Result pending'
  return hasExam ? 'Not reported' : 'No exam on file'
}

export function genexpertText(result: GeneXpertResult, hasExam: boolean): string {
  if (result === 'NOT_DETECTED') return 'MTB Not Detected'
  if (result === 'DETECTED') return 'MTB Detected'
  if (result === 'PENDING') return 'Result pending'
  return hasExam ? 'N/A' : '—'
}

export const isDangerFinding = (value: CxrResult | GeneXpertResult) => value === 'INFILTRATE' || value === 'DETECTED'

export const PEP_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
}

export const isPepActive = (status: string) => status !== 'COMPLETED' && status !== 'DECLINED'

/** Whole days since an exposure, counting the day it happened as Day 1 ("Day 3" = two days after). */
export function exposureDay(exposureDate: string, today = new Date()): number {
  const start = Date.parse(exposureDate.slice(0, 10))
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(1, Math.floor((now - start) / 86_400_000) + 1)
}

/** "Aug 2026", read as UTC so a month-end date never slips into the neighbouring month. */
export function monthYear(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "September 5, 2026" */
export function longDate(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

export const isoDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—')

/** Clamp a page index after the row count shrinks (a new search leaves fewer pages than before). */
export function clampPage(page: number, total: number, pageSize: number): number {
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  return Math.min(Math.max(0, page), lastPage)
}
