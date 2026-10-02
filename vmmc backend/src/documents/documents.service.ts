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

const DOCUMENT_COLUMNS =
  'id, doc_type, cxr_result, genexpert_result, exam_date, review_status, file_type, file_size_bytes, uploaded_at';

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
  exam_date: string | null;
  uploaded_at: string;
  employees: ReviewQueueEmployee | ReviewQueueEmployee[];
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
    if (!dto.cxrResult && !dto.genexpertResult) {
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

    const complianceRecordId = await this.complianceRecordService.getCurrentCycleRecordId(employee.id);

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
        doc_type: 'APE',
        cxr_result: dto.cxrResult ?? 'NOT_APPLICABLE',
        genexpert_result: dto.genexpertResult ?? 'NOT_APPLICABLE',
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

  async listMine(employee: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .eq('employee_id', employee.id)
      .order('uploaded_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => this.toResponse(row));
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
        `id, doc_type, cxr_result, genexpert_result, exam_date, uploaded_at,
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
          examDate: row.exam_date,
          uploadedAt: row.uploaded_at,
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
      examDate: row.exam_date,
      reviewStatus: row.review_status,
      fileType: row.file_type,
      fileSizeBytes: row.file_size_bytes,
      uploadedAt: row.uploaded_at,
    };
  }
}
