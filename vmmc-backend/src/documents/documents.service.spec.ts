import { BadRequestException } from '@nestjs/common';
import { ComplianceRecordService } from '../compliance/compliance-record.service';
import { EmployeeContext } from '../auth/types/role';
import { EventClassifierService } from '../monitoring/event-classifier.service';
import { SignaturesService } from '../signatures/signatures.service';
import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { DocumentsService } from './documents.service';

const EMPLOYEE: EmployeeContext = {
  id: 'employee-1',
  authUserId: 'auth-1',
  employeeId: 'VMMC-24-0009',
  fullName: 'Test Employee',
  jobTitle: 'Staff Nurse',
  email: 'test@vmmc.gov.ph',
  role: 'STAFF',
  departmentId: 'dept-1',
  birthDate: '1990-01-01',
};

const PDF_BUFFER = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20)]);

const EXISTING_ROW = {
  id: 'doc-existing',
  doc_type: 'APE',
  cxr_result: 'CLEARED',
  genexpert_result: 'NOT_APPLICABLE',
  exam_date: '2026-06-15',
  review_status: 'PENDING',
  file_type: 'application/pdf',
  file_size_bytes: PDF_BUFFER.length,
  uploaded_at: '2026-06-15T00:00:00Z',
};

function buildService(chainResults: { data: unknown; error: unknown }[], storageUploadError: unknown = null) {
  const { client, calls } = createSupabaseClientMock(chainResults);
  (client as unknown as { storage: unknown }).storage = {
    from: jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ error: storageUploadError }),
    })),
  };
  const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
  const complianceRecordService = {
    getCurrentCycleRecordId: jest.fn().mockResolvedValue('record-1'),
  } as unknown as ComplianceRecordService;
  const signaturesService = {} as SignaturesService;
  const eventClassifierService = {} as EventClassifierService;

  const service = new DocumentsService(supabaseService, complianceRecordService, signaturesService, eventClassifierService);
  return { service, calls, client };
}

describe('DocumentsService.upload — idempotency (double-submit never duplicates a row)', () => {
  it('returns the existing row immediately when the idempotency key already matches a row — no insert attempted', async () => {
    const { service, calls } = buildService([
      { data: EXISTING_ROW, error: null }, // the idempotency-key lookup finds the first submission's row
    ]);

    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    const result = await service.upload(EMPLOYEE, file, { examDate: '2026-06-15', cxrResult: 'CLEARED' }, 'same-key-123');

    expect(result.id).toBe('doc-existing');
    expect(calls).toEqual(['documents']); // only the lookup — no storage upload, no insert
  });

  it('two concurrent requests with the same key that both pass the initial check still end up as one row', async () => {
    // Simulates the race: request A's lookup misses (row doesn't exist yet), it proceeds to
    // insert, but request B already committed a row with the same idempotency_key in between —
    // so A's own insert hits a unique-violation (23505), and the code must recover by fetching
    // and returning B's row, rather than erroring out or silently creating a duplicate.
    const { service, calls } = buildService([
      { data: null, error: null }, // idempotency-key lookup: not found yet
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }, // insert loses the race
      { data: EXISTING_ROW, error: null }, // recovery fetch returns the winning row
    ]);

    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    const result = await service.upload(EMPLOYEE, file, { examDate: '2026-06-15', cxrResult: 'CLEARED' }, 'same-key-123');

    expect(result.id).toBe('doc-existing');
    expect(calls).toEqual(['documents', 'documents', 'documents']);
  });

  it('a genuinely new idempotency key proceeds to a real insert', async () => {
    const newRow = { ...EXISTING_ROW, id: 'doc-new' };
    const { service, calls } = buildService([
      { data: null, error: null }, // idempotency-key lookup: not found
      { data: newRow, error: null }, // insert succeeds
    ]);

    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    const result = await service.upload(EMPLOYEE, file, { examDate: '2026-06-15', cxrResult: 'CLEARED' }, 'brand-new-key');

    expect(result.id).toBe('doc-new');
    expect(calls).toEqual(['documents', 'documents']);
  });
});

describe('DocumentsService.upload — upload gateway validation', () => {
  it('rejects a file over the 5MB limit before ever touching the database', async () => {
    const { service, calls } = buildService([]);
    const oversized = { buffer: PDF_BUFFER, size: 6 * 1024 * 1024 } as Express.Multer.File;

    await expect(service.upload(EMPLOYEE, oversized, { examDate: '2026-06-15', cxrResult: 'CLEARED' })).rejects.toThrow(
      BadRequestException,
    );
    expect(calls).toEqual([]);
  });

  it('rejects a file whose magic bytes are not pdf/png/jpeg, regardless of claimed size', async () => {
    const { service, calls } = buildService([]);
    const notARealDocument = { buffer: Buffer.from('just text'), size: 100 } as Express.Multer.File;

    await expect(
      service.upload(EMPLOYEE, notARealDocument, { examDate: '2026-06-15', cxrResult: 'CLEARED' }),
    ).rejects.toThrow(BadRequestException);
    expect(calls).toEqual([]);
  });

  it('rejects an upload with no file at all', async () => {
    const { service } = buildService([]);
    await expect(
      service.upload(EMPLOYEE, undefined, { examDate: '2026-06-15', cxrResult: 'CLEARED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an upload missing both cxrResult and genexpertResult', async () => {
    const { service, calls } = buildService([]);
    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    await expect(service.upload(EMPLOYEE, file, { examDate: '2026-06-15' })).rejects.toThrow(BadRequestException);
    expect(calls).toEqual([]);
  });
});
