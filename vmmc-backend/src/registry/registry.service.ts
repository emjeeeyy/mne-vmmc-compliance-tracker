import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceRecordService } from '../compliance/compliance-record.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ApprovedApeRow,
  buildApeRows,
  buildImmunizationRows,
  buildPepRows,
  buildPreEmploymentRows,
  CycleRecordRow,
  ImmunizationRow,
  nextCycleDueDate,
  PepLogRow,
  PersonRow,
  PreEmploymentRow,
} from './registry-builders';
import type { ApeRegistryRow, ClearanceCertificate, ImmunizationRegistryRow, PepRegistryRow, PreEmploymentRegistryRow } from './types';

const SIGNATURE_BUCKET = 'signatures';
/** Long enough to open the certificate, review it and print it; the page re-fetches on every open. */
const SIGNATURE_URL_TTL_SECONDS = 900;

const PERSON_SELECT = 'id, employee_id, full_name, job_title, departments!employees_department_id_fkey ( name, code )';

/** Read models for the admin "Modules Registry": one row per active employee for each of the four tracking
 * modules, already bucketed and sorted. Searching and the status filter are applied by the page — the
 * data is one small table per module, so a keystroke never needs another round trip. */
@Injectable()
export class RegistryService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly complianceRecordService: ComplianceRecordService,
  ) {}

  private async activePeople(): Promise<PersonRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('employees')
      .select(PERSON_SELECT)
      .eq('employment_status', 'ACTIVE')
      .order('full_name')
      .returns<PersonRow[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getApe(): Promise<ApeRegistryRow[]> {
    await this.complianceRecordService.ensureCurrentCycleRecords();
    const client = this.supabaseService.getClient();
    const cycleYear = new Date().getUTCFullYear();

    const [people, records, approved] = await Promise.all([
      this.activePeople(),
      client
        .from('compliance_records')
        .select('employee_id, status, clinical_status, due_date, approved_document_id')
        .eq('cycle_year', cycleYear)
        .returns<CycleRecordRow[]>(),
      client
        .from('documents')
        .select('employee_id, exam_date, cxr_result, genexpert_result')
        .eq('doc_type', 'APE')
        .eq('review_status', 'APPROVED')
        .returns<ApprovedApeRow[]>(),
    ]);
    if (records.error) throw records.error;
    if (approved.error) throw approved.error;
    return buildApeRows(people, records.data ?? [], approved.data ?? []);
  }

  async getPreEmployment(): Promise<PreEmploymentRegistryRow[]> {
    const [people, records] = await Promise.all([
      this.activePeople(),
      this.supabaseService
        .getClient()
        .from('pre_employment')
        .select('employee_id, screening_result, fit_for_duty, cleared_at')
        .returns<PreEmploymentRow[]>(),
    ]);
    if (records.error) throw records.error;
    return buildPreEmploymentRows(people, records.data ?? []);
  }

  async getPep(): Promise<PepRegistryRow[]> {
    const [people, logs] = await Promise.all([
      this.activePeople(),
      this.supabaseService
        .getClient()
        .from('pep_logs')
        .select('id, employee_id, exposure_date, exposure_type, prophylaxis_status, follow_up_date')
        .returns<PepLogRow[]>(),
    ]);
    if (logs.error) throw logs.error;
    return buildPepRows(people, logs.data ?? []);
  }

  async getImmunizations(): Promise<ImmunizationRegistryRow[]> {
    const [people, doses] = await Promise.all([
      this.activePeople(),
      this.supabaseService
        .getClient()
        .from('immunizations')
        .select('employee_id, vaccine_type, dose, administered_date, next_due_date')
        .returns<ImmunizationRow[]>(),
    ]);
    if (doses.error) throw doses.error;
    return buildImmunizationRows(people, doses.data ?? []);
  }

  /** Data for the printable Annual TB Health Clearance Certificate. Only ever issued for a person who is
   * actually cleared this cycle (approved APE, signed by the reviewing admin, no CRITICAL finding) — a
   * certificate that declares someone fit for duty must not be obtainable for anyone else. */
  async getClearanceCertificate(employeeId: string): Promise<ClearanceCertificate> {
    const client = this.supabaseService.getClient();
    const cycleYear = new Date().getUTCFullYear();

    const { data: employee } = await client
      .from('employees')
      .select('id, employee_id, full_name, job_title, departments!employees_department_id_fkey ( name )')
      .eq('id', employeeId)
      .maybeSingle<{ id: string; employee_id: string; full_name: string; job_title: string | null; departments: { name: string } | { name: string }[] | null }>();
    if (!employee) throw new NotFoundException('Employee not found.');

    const { data: record } = await client
      .from('compliance_records')
      .select('status, clinical_status, due_date, approved_document_id')
      .eq('employee_id', employeeId)
      .eq('cycle_year', cycleYear)
      .maybeSingle<{ status: string; clinical_status: string; due_date: string; approved_document_id: string | null }>();
    if (!record || record.status !== 'COMPLIANT' || !record.approved_document_id) {
      throw new ConflictException('A clearance certificate can only be issued once the annual physical exam has been approved.');
    }
    if (record.clinical_status === 'CRITICAL') {
      throw new ConflictException('A clearance certificate cannot be issued while a clinical alert is open for this person.');
    }

    const { data: document } = await client
      .from('documents')
      .select('cxr_result, genexpert_result, exam_date, reviewed_at, reviewed_by, signature_id')
      .eq('id', record.approved_document_id)
      .maybeSingle<{
        cxr_result: ClearanceCertificate['cxrResult'];
        genexpert_result: ClearanceCertificate['genexpertResult'];
        exam_date: string | null;
        reviewed_at: string | null;
        reviewed_by: string | null;
        signature_id: string | null;
      }>();
    if (!document?.reviewed_at || !document.reviewed_by) {
      throw new ConflictException('The approved exam has no reviewer on record, so a certificate cannot be issued.');
    }

    const { data: reviewer } = await client
      .from('employees')
      .select('full_name, job_title')
      .eq('id', document.reviewed_by)
      .maybeSingle<{ full_name: string; job_title: string | null }>();

    const signatureUrl = await this.signatureUrl(document.signature_id);
    const department = Array.isArray(employee.departments) ? employee.departments[0] : employee.departments;

    return {
      employee: { fullName: employee.full_name, employeeId: employee.employee_id, jobTitle: employee.job_title, department: department?.name ?? 'Unassigned' },
      cxrResult: document.cxr_result,
      genexpertResult: document.genexpert_result,
      examDate: document.exam_date,
      issuedAt: document.reviewed_at,
      validUntil: nextCycleDueDate(record.due_date),
      signatory: { fullName: reviewer?.full_name ?? 'TB DOTS Unit', jobTitle: reviewer?.job_title ?? null, signatureUrl },
    };
  }

  /** The reviewer's signature image, or null: a missing or unsignable image must not block printing the certificate. */
  private async signatureUrl(signatureId: string | null): Promise<string | null> {
    if (!signatureId) return null;
    const client = this.supabaseService.getClient();
    const { data: signature } = await client.from('digital_signatures').select('signature_path').eq('id', signatureId).maybeSingle<{ signature_path: string }>();
    if (!signature) return null;
    const { data } = await client.storage.from(SIGNATURE_BUCKET).createSignedUrl(signature.signature_path, SIGNATURE_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  }
}
