import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceRecordService } from '../compliance/compliance-record.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EmployeeContext } from '../auth/types/role';
import { EventClassifierService } from '../monitoring/event-classifier.service';
import { ComplianceRecordRow } from '../monitoring/types';
import { SignaturesService } from '../signatures/signatures.service';
import { assertDocumentAccess } from '../common/assert-access';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ALLOWED_MIME_TYPES, detectFileType } from './file-type';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const BUCKET = 'documents';
const FILE_URL_TTL_SECONDS = 300;

const DOCUMENT_COLUMNS =
  'id, doc_type, cxr_result, genexpert_result, titer_result, title, facility_name, notes, exam_date, review_status, file_type, file_size_bytes, uploaded_at';

interface MyDocumentRow {
  id: string;
  doc_type: string;
  cxr_result: string;
  genexpert_result: string;
  titer_result: string;
  title: string | null;
  facility_name: string | null;
  notes: string | null;
  exam_date: string | null;
  review_status: string;
  file_type: string;
  file_size_bytes: number;
  uploaded_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_notes: string | null;
  reviewer: { full_name: string } | { full_name: string }[] | null;
}

interface ReviewQueueDepartment {
  name: string;
  code: string;
}

interface ReviewQueueEmployee {
  id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  department_id: string;
  departments: ReviewQueueDepartment | ReviewQueueDepartment[];
}

interface ReviewQueueRow {
  id: string;
  doc_type: string;
  cxr_result: string;
  genexpert_result: string;
  titer_result: string;
  title: string | null;
  facility_name: string | null;
  notes: string | null;
  exam_date: string | null;
  uploaded_at: string;
  employees: ReviewQueueEmployee | ReviewQueueEmployee[];
  compliance_records: { due_date: string } | { due_date: string }[] | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly complianceRecordService: ComplianceRecordService,
    private readonly signaturesService: SignaturesService,
    private readonly eventClassifierService: EventClassifierService,
  ) {}

  async upload(
    employee: EmployeeContext,
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (file.size > MAX_FILE_SIZE_BYTES) throw new BadRequestException('File exceeds the 5MB limit.');
    if (dto.category === 'HEPB_TITER') {
      if (!dto.titerResult) throw new BadRequestException('Provide the titer result (REACTIVE or NON_REACTIVE).');
    } else if (!dto.cxrResult && !dto.genexpertResult) {
      throw new BadRequestException('Provide at least one of cxrResult or genexpertResult.');
    }

    const detectedType = detectFileType(file.buffer);
    if (!detectedType) throw new BadRequestException('File must be a PDF, PNG, or JPEG.');

    const client = this.supabaseService.getClient();

    if (idempotencyKey) {
      const { data: existing } = await client
        .from('documents')
        .select(DOCUMENT_COLUMNS)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (existing) return this.toResponse(existing);
    }

    // Only APE participates in the birthday-cycle SLA machinery — a Hep B Titer is one-time,
    // no recurrence, no compliance_record linkage, no M&E engine involvement. Must stay
    // conditional: review()'s compliance_records mutation below is gated purely on this being
    // non-null, so an unconditional lookup here would silently attach every Hep B Titer upload
    // to the employee's real APE cycle and let its approval clobber that cycle's clearance.
    const complianceRecordId =
      dto.category === 'APE' ? await this.complianceRecordService.getCurrentCycleRecordId(employee.id) : null;

    const storagePath = `${employee.id}/${randomUUID()}.${detectedType}`;
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { contentType: ALLOWED_MIME_TYPES[detectedType], upsert: false });
    if (uploadError) throw new BadRequestException(uploadError.message);

    const { data, error } = await client
      .from('documents')
      .insert({
        employee_id: employee.id,
        compliance_record_id: complianceRecordId,
        idempotency_key: idempotencyKey ?? null,
        storage_path: storagePath,
        file_type: ALLOWED_MIME_TYPES[detectedType],
        file_size_bytes: file.size,
        doc_type: dto.category,
        cxr_result: dto.cxrResult ?? 'NOT_APPLICABLE',
        genexpert_result: dto.genexpertResult ?? 'NOT_APPLICABLE',
        titer_result: dto.titerResult ?? 'NOT_APPLICABLE',
        title: dto.title ?? null,
        facility_name: dto.facilityName ?? null,
        notes: dto.notes ?? null,
        exam_date: dto.examDate,
        review_status: 'PENDING',
      })
      .select(DOCUMENT_COLUMNS)
      .single();

    if (error) {
      // Unique violation on idempotency_key — a concurrent retry beat us to it; return that row instead.
      if (error.code === '23505' && idempotencyKey) {
        const { data: existing } = await client
          .from('documents')
          .select(DOCUMENT_COLUMNS)
          .eq('idempotency_key', idempotencyKey)
          .single();
        if (existing) return this.toResponse(existing);
      }
      throw new BadRequestException(error.message);
    }

    return this.toResponse(data);
  }

  /** A short-lived signed link to view one uploaded file, for the Document Verification preview. */
  async getFileUrl(currentUser: EmployeeContext, documentId: string) {
    const client = this.supabaseService.getClient();
    const { data: document } = await client
      .from('documents')
      .select('id, employee_id, storage_path, file_type')
      .eq('id', documentId)
      .maybeSingle<{ id: string; employee_id: string; storage_path: string; file_type: string }>();
    if (!document) throw new NotFoundException('Document not found.');

    const { data: owner } = await client.from('employees').select('department_id').eq('id', document.employee_id).maybeSingle();
    const { data: currentDepartment } = await client.from('departments').select('code').eq('id', currentUser.departmentId).maybeSingle();
    assertDocumentAccess(currentUser, owner?.department_id ?? '', document.employee_id, currentDepartment?.code);

    const { data: signed, error } = await client.storage.from(BUCKET).createSignedUrl(document.storage_path, FILE_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) throw new NotFoundException('The file for this document could not be found.');
    return { url: signed.signedUrl, fileType: document.file_type, expiresInSeconds: FILE_URL_TTL_SECONDS };
  }

  /** The owner's own history, so it also carries who reviewed each document and why it was rejected —
   * the "My Clearance & Logs" table's Verified By column and the reason a rejected upload needs redoing. */
  async listMine(employee: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('documents')
      .select(
        `${DOCUMENT_COLUMNS}, reviewed_at, rejection_reason, review_notes,
         reviewer:employees!documents_reviewed_by_fkey ( full_name )`,
      )
      .eq('employee_id', employee.id)
      .order('uploaded_at', { ascending: false })
      .returns<MyDocumentRow[]>();
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => {
      const reviewer = Array.isArray(row.reviewer) ? row.reviewer[0] : row.reviewer;
      return {
        ...this.toResponse(row),
        reviewedBy: reviewer?.full_name ?? null,
        reviewedAt: row.reviewed_at,
        rejectionReason: row.rejection_reason,
        reviewNotes: row.review_notes,
      };
    });
  }

  async getReviewQueue(currentUser: EmployeeContext) {
    const client = this.supabaseService.getClient();
    const { data: currentDepartment } = await client
      .from('departments')
      .select('code')
      .eq('id', currentUser.departmentId)
      .maybeSingle();

    const { data, error } = await client
      .from('documents')
      .select(
        `id, doc_type, cxr_result, genexpert_result, titer_result, title, facility_name, notes, exam_date, uploaded_at,
         compliance_records!documents_compliance_record_id_fkey ( due_date ),
         employees!documents_employee_id_fkey ( id, employee_id, full_name, job_title, department_id,
           departments!employees_department_id_fkey ( name, code ) )`,
      )
      .eq('review_status', 'PENDING')
      .order('uploaded_at', { ascending: true })
      .returns<ReviewQueueRow[]>();
    if (error) throw new BadRequestException(error.message);

    return (data ?? [])
      .filter((row) => {
        const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
        try {
          assertDocumentAccess(
            currentUser,
            employee?.department_id ?? currentUser.departmentId,
            employee?.id ?? currentUser.id,
            currentDepartment?.code,
          );
          return true;
        } catch {
          return false;
        }
      })
      .map((row) => {
        const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
        let department: ReviewQueueDepartment | undefined;
        if (employee) department = Array.isArray(employee.departments) ? employee.departments[0] : employee.departments;
        return {
          id: row.id,
          docType: row.doc_type,
          cxrResult: row.cxr_result,
          genexpertResult: row.genexpert_result,
          titerResult: row.titer_result,
          title: row.title,
          facilityName: row.facility_name,
          notes: row.notes,
          examDate: row.exam_date,
          uploadedAt: row.uploaded_at,
          // Only APE documents hang off a compliance cycle, so a Hep B Titer has no due date.
          dueDate: (Array.isArray(row.compliance_records) ? row.compliance_records[0] : row.compliance_records)?.due_date ?? null,
          employee: {
            id: employee?.id,
            employeeId: employee?.employee_id,
            fullName: employee?.full_name,
            jobTitle: employee?.job_title,
            department: department?.name,
          },
        };
      });
  }

  async review(currentUser: EmployeeContext, documentId: string, dto: ReviewDocumentDto) {
    const client = this.supabaseService.getClient();

    const { data: document, error: findError } = await client
      .from('documents')
      .select('id, employee_id, compliance_record_id, review_status')
      .eq('id', documentId)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!document) throw new NotFoundException('Document not found.');
    if (document.review_status !== 'PENDING') {
      throw new BadRequestException('This document has already been reviewed.');
    }

    const { data: employee } = await client
      .from('employees')
      .select('department_id')
      .eq('id', document.employee_id)
      .maybeSingle();

    if (currentUser.role !== 'ADMIN' && !(currentUser.role === 'UNIT_HEAD' && currentUser.departmentId === employee?.department_id)) {
      throw new ForbiddenException('You do not have permission to review this document.');
    }

    if (dto.action === 'reject') {
      if (!dto.reason) throw new BadRequestException('A reason is required to reject a document.');
      const { error } = await client
        .from('documents')
        .update({
          review_status: 'REJECTED',
          reviewed_by: currentUser.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: dto.reason,
        })
        .eq('id', documentId);
      if (error) throw new BadRequestException(error.message);
      await this.eventClassifierService.classifyDocumentRejected(documentId, document.employee_id, dto.reason);
      return { message: 'Document rejected.' };
    }

    // Approve
    if (!dto.signatureId) throw new BadRequestException('A signatureId is required to approve a document.');
    await this.signaturesService.assertOwnedByAdmin(dto.signatureId, currentUser.id);

    const { error: updateError } = await client
      .from('documents')
      .update({
        review_status: 'APPROVED',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        signature_id: dto.signatureId,
        review_notes: dto.notes?.trim() || null,
      })
      .eq('id', documentId);
    if (updateError) throw new BadRequestException(updateError.message);

    if (document.compliance_record_id) {
      await client
        .from('compliance_records')
        .update({ approved_document_id: documentId })
        .eq('id', document.compliance_record_id);

      const { data: record } = await client
        .from('compliance_records')
        .select('id, employee_id, cycle_year, birthday_date, window_open_date, due_date, status, clinical_status')
        .eq('id', document.compliance_record_id)
        .maybeSingle<ComplianceRecordRow>();

      if (record) {
        await this.eventClassifierService.classify(record, new Date());
      }
    }

    return { message: 'Document approved.' };
  }

  private toResponse(row: {
    id: string;
    doc_type: string;
    cxr_result: string;
    genexpert_result: string;
    titer_result: string;
    title: string | null;
    facility_name: string | null;
    notes: string | null;
    exam_date: string | null;
    review_status: string;
    file_type: string;
    file_size_bytes: number;
    uploaded_at: string;
  }) {
    return {
      id: row.id,
      docType: row.doc_type,
      cxrResult: row.cxr_result,
      genexpertResult: row.genexpert_result,
      titerResult: row.titer_result,
      title: row.title,
      facilityName: row.facility_name,
      notes: row.notes,
      examDate: row.exam_date,
      reviewStatus: row.review_status,
      fileType: row.file_type,
      fileSizeBytes: row.file_size_bytes,
      uploadedAt: row.uploaded_at,
    };
  }
}
