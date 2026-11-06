import type { ClinicalStatus, ComplianceState, CxrResult, GeneXpertResult } from '../compliance/types';
import { clearanceBucket, DUE_SOON_DAYS } from '../dashboard/dashboard.service';
import type {
  ApeRegistryRow,
  ImmunizationDoseEntry,
  ImmunizationRegistryRow,
  PepRegistryEntry,
  PepRegistryRow,
  PreEmploymentRegistryRow,
  RegistryBucket,
  RegistryPerson,
} from './types';

/** An active employee as selected from `employees` with its department embedded. */
export interface PersonRow {
  id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  departments: { name: string; code: string } | { name: string; code: string }[] | null;
}

export interface CycleRecordRow {
  employee_id: string;
  status: ComplianceState;
  clinical_status: ClinicalStatus;
  due_date: string;
  approved_document_id: string | null;
}

export interface ApprovedApeRow {
  employee_id: string;
  exam_date: string | null;
  cxr_result: CxrResult;
  genexpert_result: GeneXpertResult;
}

export interface PreEmploymentRow {
  employee_id: string;
  screening_result: string | null;
  fit_for_duty: boolean;
  cleared_at: string | null;
}

export interface PepLogRow {
  id: string;
  employee_id: string;
  exposure_date: string;
  exposure_type: string;
  prophylaxis_status: string;
  follow_up_date: string | null;
}

export interface ImmunizationRow {
  employee_id: string;
  vaccine_type: string;
  dose: number;
  administered_date: string;
  next_due_date: string | null;
}

const BUCKET_RANK: Record<RegistryBucket, number> = { OVERDUE: 0, DUE_SOON: 1, NO_RECORD: 2, UP_TO_DATE: 3 };
const PEP_TERMINAL = ['COMPLETED', 'DECLINED'];

const today = () => new Date().toISOString().slice(0, 10);

function toPerson(row: PersonRow): RegistryPerson {
  const department = (Array.isArray(row.departments) ? row.departments[0] : row.departments) ?? { name: 'Unassigned', code: '—' };
  return { id: row.id, employeeId: row.employee_id, fullName: row.full_name, jobTitle: row.job_title, department };
}

/** Most urgent first, then alphabetical — the reason an admin opens the registry is the people who need action. */
export function sortRegistryRows<T extends { bucket: RegistryBucket; fullName: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] || a.fullName.localeCompare(b.fullName));
}

function groupBy<T extends { employee_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.employee_id);
    if (list) list.push(row);
    else grouped.set(row.employee_id, [row]);
  }
  return grouped;
}

/** The compliance-timeline bucket, tightened for a pill that reads "Up to Date / Cleared":
 *  - a CRITICAL clinical status always needs action — a positive result is not "up to date" just because
 *    the paperwork arrived on time;
 *  - only someone actually cleared this cycle is up to date. `clearanceBucket` (used by the Health Overview
 *    charts) files an uncleared person with a distant deadline under UP_TO_DATE; here that person is
 *    "upcoming" instead, so a row never says "cleared" beside a "Not cleared" action. */
export function apeBucket(record: Pick<CycleRecordRow, 'status' | 'clinical_status' | 'due_date'>, todayIso: string): RegistryBucket {
  if (record.clinical_status === 'CRITICAL') return 'OVERDUE';
  const bucket = clearanceBucket(record, todayIso);
  return bucket === 'UP_TO_DATE' && record.status !== 'COMPLIANT' ? 'DUE_SOON' : bucket;
}

/** The deadline after `dueDate`: due dates are always the last day of a month, so this is the last day of the
 * same month a year later (adding 365 days would drift, and "+1 year" turns Feb 29 into Mar 1). */
export function nextCycleDueDate(dueDate: string): string {
  const [year, month] = dueDate.split('-').map(Number);
  return new Date(Date.UTC(year + 1, month, 0)).toISOString().slice(0, 10);
}

export function buildApeRows(people: PersonRow[], records: CycleRecordRow[], approved: ApprovedApeRow[], todayIso = today()): ApeRegistryRow[] {
  const recordByEmployee = new Map(records.map((r) => [r.employee_id, r]));
  // Newest exam first, so the first doc seen per employee is their latest.
  const latestByEmployee = new Map<string, ApprovedApeRow>();
  for (const doc of [...approved].sort((a, b) => (b.exam_date ?? '').localeCompare(a.exam_date ?? ''))) {
    if (!latestByEmployee.has(doc.employee_id)) latestByEmployee.set(doc.employee_id, doc);
  }

  const rows: ApeRegistryRow[] = [];
  for (const person of people) {
    const record = recordByEmployee.get(person.id);
    if (!record) continue;
    const latest = latestByEmployee.get(person.id);
    const bucket = apeBucket(record, todayIso);
    rows.push({
      ...toPerson(person),
      bucket,
      status: record.status,
      clinicalStatus: record.clinical_status,
      lastExamDate: latest?.exam_date ?? null,
      cxrResult: latest?.cxr_result ?? 'NOT_APPLICABLE',
      genexpertResult: latest?.genexpert_result ?? 'NOT_APPLICABLE',
      nextDueDate: record.status === 'COMPLIANT' ? nextCycleDueDate(record.due_date) : record.due_date,
      certificateAvailable: record.status === 'COMPLIANT' && record.clinical_status !== 'CRITICAL' && record.approved_document_id !== null,
    });
  }
  return sortRegistryRows(rows);
}

export function buildPreEmploymentRows(people: PersonRow[], records: PreEmploymentRow[]): PreEmploymentRegistryRow[] {
  const byEmployee = new Map(records.map((r) => [r.employee_id, r]));
  return sortRegistryRows(
    people.map((person) => {
      const record = byEmployee.get(person.id);
      const bucket: RegistryBucket = !record ? 'NO_RECORD' : record.fit_for_duty ? 'UP_TO_DATE' : 'OVERDUE';
      return {
        ...toPerson(person),
        bucket,
        screeningResult: record?.screening_result ?? null,
        fitForDuty: record?.fit_for_duty ?? false,
        clearedAt: record?.cleared_at ?? null,
        hasRecord: Boolean(record),
      };
    }),
  );
}

const toPepEntry = (log: PepLogRow): PepRegistryEntry => ({
  id: log.id,
  exposureDate: log.exposure_date,
  exposureType: log.exposure_type,
  prophylaxisStatus: log.prophylaxis_status,
  followUpDate: log.follow_up_date,
});

/** An exposure that is still being followed up is "upcoming" until its follow-up date passes; having no
 * exposure at all (or only finished ones) is the clear state — it is not a missing record. */
export function buildPepRows(people: PersonRow[], logs: PepLogRow[], todayIso = today()): PepRegistryRow[] {
  const byEmployee = groupBy(logs);
  return sortRegistryRows(
    people.map((person) => {
      const own = byEmployee.get(person.id) ?? [];
      const active = own.filter((l) => !PEP_TERMINAL.includes(l.prophylaxis_status));
      let bucket: RegistryBucket = 'UP_TO_DATE';
      let latest: PepLogRow | undefined;
      if (active.length > 0) {
        active.sort((a, b) => (a.follow_up_date ?? '9999-12-31').localeCompare(b.follow_up_date ?? '9999-12-31'));
        latest = active[0];
        bucket = active.some((l) => l.follow_up_date !== null && l.follow_up_date < todayIso) ? 'OVERDUE' : 'DUE_SOON';
      } else {
        latest = [...own].sort((a, b) => b.exposure_date.localeCompare(a.exposure_date))[0];
      }
      return { ...toPerson(person), bucket, activeCount: active.length, latest: latest ? toPepEntry(latest) : null };
    }),
  );
}

const toDoseEntry = (row: ImmunizationRow): ImmunizationDoseEntry => ({
  vaccineType: row.vaccine_type,
  dose: row.dose,
  administeredDate: row.administered_date,
  nextDueDate: row.next_due_date,
});

/** Overdue-ness is judged on the latest dose of each vaccine only: a newer dose supersedes an old overdue one. */
export function buildImmunizationRows(people: PersonRow[], doses: ImmunizationRow[], todayIso = today()): ImmunizationRegistryRow[] {
  const byEmployee = groupBy(doses);
  const newestFirst = (a: ImmunizationRow, b: ImmunizationRow) => b.administered_date.localeCompare(a.administered_date) || b.dose - a.dose;

  return sortRegistryRows(
    people.map((person) => {
      const own = [...(byEmployee.get(person.id) ?? [])].sort(newestFirst);
      if (own.length === 0) return { ...toPerson(person), bucket: 'NO_RECORD' as const, latest: null, attention: null, bcgDate: null };

      const latestPerVaccine = new Map<string, ImmunizationRow>();
      for (const dose of own) {
        const key = dose.vaccine_type.trim().toLowerCase();
        if (!latestPerVaccine.has(key)) latestPerVaccine.set(key, dose);
      }
      let bucket: RegistryBucket = 'UP_TO_DATE';
      let attention: ImmunizationRow | undefined;
      for (const dose of [...latestPerVaccine.values()].filter((d) => d.next_due_date).sort((a, b) => a.next_due_date!.localeCompare(b.next_due_date!))) {
        const due = dose.next_due_date!;
        const daysLeft = (Date.parse(due) - Date.parse(todayIso)) / 86_400_000;
        const doseBucket: RegistryBucket = due < todayIso ? 'OVERDUE' : daysLeft <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UP_TO_DATE';
        if (doseBucket === 'UP_TO_DATE') continue;
        // Sorted by next-due date, so the first non-clear dose is the most urgent; an OVERDUE one always sorts before DUE_SOON.
        bucket = doseBucket;
        attention = dose;
        break;
      }
      const bcg = own.find((d) => /bcg/i.test(d.vaccine_type));
      return { ...toPerson(person), bucket, latest: toDoseEntry(own[0]), attention: attention ? toDoseEntry(attention) : null, bcgDate: bcg?.administered_date ?? null };
    }),
  );
}
