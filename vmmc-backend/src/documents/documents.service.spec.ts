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
  twoFactorEnabled: false,
};

const PDF_BUFFER = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20)]);

const EXISTING_ROW = {
  id: 'doc-existing',
  doc_type: 'APE',
  cxr_result: 'CLEARED',
  genexpert_result: 'NOT_APPLICABLE',
  titer_result: 'NOT_APPLICABLE',
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
  const signaturesService = {
    assertOwnedByAdmin: jest.fn().mockResolvedValue(undefined),
  } as unknown as SignaturesService;
  const eventClassifierService = {
    classify: jest.fn().mockResolvedValue(undefined),
    classifyDocumentRejected: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventClassifierService;

  const service = new DocumentsService(supabaseService, complianceRecordService, signaturesService, eventClassifierService);
  return { service, calls, client, complianceRecordService, signaturesService, eventClassifierService };
}

describe('DocumentsService.upload — idempotency (double-submit never duplicates a row)', () => {
  it('returns the existing row immediately when the idempotency key already matches a row — no insert attempted', async () => {
    const { service, calls } = buildService([
      { data: EXISTING_ROW, error: null }, // the idempotency-key lookup finds the first submission's row
    ]);

    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    const result = await service.upload(EMPLOYEE, file, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' }, 'same-key-123');

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
    const result = await service.upload(EMPLOYEE, file, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' }, 'same-key-123');

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
    const result = await service.upload(EMPLOYEE, file, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' }, 'brand-new-key');

    expect(result.id).toBe('doc-new');
    expect(calls).toEqual(['documents', 'documents']);
  });
});

describe('DocumentsService.upload — upload gateway validation', () => {
  it('rejects a file over the 5MB limit before ever touching the database', async () => {
    const { service, calls } = buildService([]);
    const oversized = { buffer: PDF_BUFFER, size: 6 * 1024 * 1024 } as Express.Multer.File;

    await expect(service.upload(EMPLOYEE, oversized, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' })).rejects.toThrow(
      BadRequestException,
    );
    expect(calls).toEqual([]);
  });

  it('rejects a file whose magic bytes are not pdf/png/jpeg, regardless of claimed size', async () => {
    const { service, calls } = buildService([]);
    const notARealDocument = { buffer: Buffer.from('just text'), size: 100 } as Express.Multer.File;

    await expect(
      service.upload(EMPLOYEE, notARealDocument, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' }),
    ).rejects.toThrow(BadRequestException);
    expect(calls).toEqual([]);
  });

  it('rejects an upload with no file at all', async () => {
    const { service } = buildService([]);
    await expect(
      service.upload(EMPLOYEE, undefined, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an upload missing both cxrResult and genexpertResult', async () => {
    const { service, calls } = buildService([]);
    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    await expect(service.upload(EMPLOYEE, file, { category: 'APE', examDate: '2026-06-15' })).rejects.toThrow(
      BadRequestException,
    );
    expect(calls).toEqual([]);
  });
});

describe('DocumentsService.upload — category branching (Hep B Titers)', () => {
  it('a HEPB_TITER upload never looks up the APE compliance cycle, and stores doc_type/titer_result/a null compliance_record_id', async () => {
    // The whole point of this test: upload() used to fetch the current-cycle APE record
    // unconditionally for every upload. A Hep B Titer must never trigger that lookup, or its
    // later approval would overwrite the employee's real APE compliance_records row (see the
    // comment above this branch in documents.service.ts) with a document that was never an
    // X-ray/GeneXpert result.
    const titerRow = {
      id: 'doc-titer-1',
      doc_type: 'HEPB_TITER',
      cxr_result: 'NOT_APPLICABLE',
      genexpert_result: 'NOT_APPLICABLE',
      titer_result: 'REACTIVE',
      exam_date: '2026-06-15',
      review_status: 'PENDING',
      file_type: 'application/pdf',
      file_size_bytes: PDF_BUFFER.length,
      uploaded_at: '2026-06-15T00:00:00Z',
    };
    const { service, calls, client, complianceRecordService } = buildService([
      { data: titerRow, error: null }, // no idempotency key supplied, so this is the only .from() call: the insert
    ]);

    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;
    const result = await service.upload(EMPLOYEE, file, {
      category: 'HEPB_TITER',
      examDate: '2026-06-15',
      titerResult: 'REACTIVE',
    });

    expect(result.id).toBe('doc-titer-1');
    expect(calls).toEqual(['documents']);
    expect(complianceRecordService.getCurrentCycleRecordId).not.toHaveBeenCalled();

    const insertArg = client.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(insertArg.doc_type).toBe('HEPB_TITER');
    expect(insertArg.compliance_record_id).toBeNull();
    expect(insertArg.titer_result).toBe('REACTIVE');
  });

  it('rejects a HEPB_TITER upload missing titerResult, before touching the database', async () => {
    const { service, calls, complianceRecordService } = buildService([]);
    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;

    await expect(service.upload(EMPLOYEE, file, { category: 'HEPB_TITER', examDate: '2026-06-15' })).rejects.toThrow(
      BadRequestException,
    );
    expect(calls).toEqual([]);
    expect(complianceRecordService.getCurrentCycleRecordId).not.toHaveBeenCalled();
  });

  it('an APE upload still looks up the current compliance cycle, unchanged from before this feature', async () => {
    const newRow = { ...EXISTING_ROW, id: 'doc-ape-1' };
    const { service, complianceRecordService } = buildService([{ data: newRow, error: null }]);
    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;

    await service.upload(EMPLOYEE, file, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' });

    expect(complianceRecordService.getCurrentCycleRecordId).toHaveBeenCalledWith(EMPLOYEE.id);
  });
});

describe('DocumentsService.upload — optional metadata fields (title/facilityName/notes)', () => {
  it('persists title/facilityName/notes into the insert payload when provided', async () => {
    const row = { ...EXISTING_ROW, id: 'doc-meta-1', title: 'Chest Radiograph Report 2026', facility_name: 'VMMC Radiology Wing', notes: 'Patient reports mild cough.' };
    const { service, client } = buildService([{ data: row, error: null }]);
    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;

    const result = await service.upload(EMPLOYEE, file, {
      category: 'APE',
      examDate: '2026-06-15',
      cxrResult: 'CLEARED',
      title: 'Chest Radiograph Report 2026',
      facilityName: 'VMMC Radiology Wing',
      notes: 'Patient reports mild cough.',
    });

    const insertArg = client.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(insertArg.title).toBe('Chest Radiograph Report 2026');
    expect(insertArg.facility_name).toBe('VMMC Radiology Wing');
    expect(insertArg.notes).toBe('Patient reports mild cough.');
    expect(result.title).toBe('Chest Radiograph Report 2026');
    expect(result.facilityName).toBe('VMMC Radiology Wing');
    expect(result.notes).toBe('Patient reports mild cough.');
  });

  it('inserts null for title/facilityName/notes when omitted — they stay genuinely optional', async () => {
    const { service, client } = buildService([{ data: EXISTING_ROW, error: null }]);
    const file = { buffer: PDF_BUFFER, size: PDF_BUFFER.length } as Express.Multer.File;

    await service.upload(EMPLOYEE, file, { category: 'APE', examDate: '2026-06-15', cxrResult: 'CLEARED' });

    const insertArg = client.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(insertArg.title).toBeNull();
    expect(insertArg.facility_name).toBeNull();
    expect(insertArg.notes).toBeNull();
  });
});

describe('DocumentsService.getReviewQueue — carries the new metadata fields through', () => {
  it('maps title/facilityName/notes onto each returned row', async () => {
    const ADMIN: EmployeeContext = { ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' };
    const queueRow = {
      id: 'doc-1',
      doc_type: 'APE',
      cxr_result: 'CLEARED',
      genexpert_result: 'NOT_APPLICABLE',
      titer_result: 'NOT_APPLICABLE',
      title: 'Chest Radiograph Report 2026',
      facility_name: 'VMMC Radiology Wing',
      notes: 'Patient reports mild cough.',
      exam_date: '2026-06-15',
      uploaded_at: '2026-06-15T00:00:00Z',
      employees: {
        id: EMPLOYEE.id,
        employee_id: EMPLOYEE.employeeId,
        full_name: EMPLOYEE.fullName,
        job_title: EMPLOYEE.jobTitle,
        department_id: EMPLOYEE.departmentId,
        departments: { name: 'Radiology', code: 'RAD' },
      },
    };
    const { service } = buildService([
      { data: { code: 'ADMIN' }, error: null }, // current admin's own department code lookup
      { data: [queueRow], error: null }, // the pending documents query
    ]);

    const [result] = await service.getReviewQueue(ADMIN);

    expect(result.title).toBe('Chest Radiograph Report 2026');
    expect(result.facilityName).toBe('VMMC Radiology Wing');
    expect(result.notes).toBe('Patient reports mild cough.');
  });
});

describe('DocumentsService.listMine — review fields for the "My Clearance & Logs" table', () => {
  const baseRow = { ...EXISTING_ROW, title: null, facility_name: null, notes: null };

  it('maps the reviewer name, review time, and rejection reason onto each row', async () => {
    const { service } = buildService([{
      data: [{ ...baseRow, review_status: 'REJECTED', reviewed_at: '2026-06-20T03:00:00Z', rejection_reason: 'Image is blurry.', review_notes: 'Re-scan at higher resolution.', reviewer: { full_name: 'Dr. M. Garcia' } }],
      error: null,
    }]);

    const [doc] = await service.listMine(EMPLOYEE);

    expect(doc.reviewStatus).toBe('REJECTED');
    expect(doc.reviewedBy).toBe('Dr. M. Garcia');
    expect(doc.reviewedAt).toBe('2026-06-20T03:00:00Z');
    expect(doc.rejectionReason).toBe('Image is blurry.');
    expect(doc.reviewNotes).toBe('Re-scan at higher resolution.');
  });

  it('a not-yet-reviewed document has no reviewer instead of throwing on the missing join', async () => {
    const { service } = buildService([{
      data: [{ ...baseRow, reviewed_at: null, rejection_reason: null, reviewer: null }],
      error: null,
    }]);

    const [doc] = await service.listMine(EMPLOYEE);

    expect(doc.reviewedBy).toBeNull();
    expect(doc.reviewedAt).toBeNull();
    expect(doc.rejectionReason).toBeNull();
  });

  it('accepts the reviewer join in array form too (supabase-js can type to-one embeds as arrays)', async () => {
    const { service } = buildService([{
      data: [{ ...baseRow, review_status: 'APPROVED', reviewed_at: '2026-06-20T03:00:00Z', rejection_reason: null, reviewer: [{ full_name: 'Dr. M. Garcia' }] }],
      error: null,
    }]);

    const [doc] = await service.listMine(EMPLOYEE);

    expect(doc.reviewedBy).toBe('Dr. M. Garcia');
  });

  it("only ever queries the caller's own documents", async () => {
    const { service, client } = buildService([{ data: [], error: null }]);

    await service.listMine(EMPLOYEE);

    const chain = (client.from as jest.Mock).mock.results[0].value as { eq: jest.Mock };
    expect(chain.eq).toHaveBeenCalledWith('employee_id', EMPLOYEE.id);
  });
});

describe('DocumentsService.review — compliance_records is only ever touched for APE documents', () => {
  const ADMIN: EmployeeContext = { ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' };

  it('approving a document with a null compliance_record_id (e.g. a Hep B Titer) never calls the event classifier or touches compliance_records', async () => {
    const { service, calls, eventClassifierService } = buildService([
      { data: { id: 'doc-1', employee_id: EMPLOYEE.id, compliance_record_id: null, review_status: 'PENDING' }, error: null }, // find document
      { data: { department_id: EMPLOYEE.departmentId }, error: null }, // find employee's department
      { data: null, error: null }, // update review_status -> APPROVED
    ]);

    const result = await service.review(ADMIN, 'doc-1', { action: 'approve', signatureId: 'sig-1' });

    expect(result.message).toBe('Document approved.');
    expect(calls).toEqual(['documents', 'employees', 'documents']);
    expect(eventClassifierService.classify).not.toHaveBeenCalled();
  });
});

describe('DocumentsService.review — the reviewer\'s findings are recorded with an approval', () => {
  const ADMIN: EmployeeContext = { ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' };
  const pendingChain = () => [
    { data: { id: 'doc-1', employee_id: EMPLOYEE.id, compliance_record_id: null, review_status: 'PENDING' }, error: null },
    { data: { department_id: EMPLOYEE.departmentId }, error: null },
    { data: null, error: null },
  ];

  function updatePayload(client: { from: jest.Mock }) {
    const updateChain = (client.from as jest.Mock).mock.results[2].value as { update: jest.Mock };
    return updateChain.update.mock.calls[0][0] as Record<string, unknown>;
  }

  it('saves trimmed findings as review_notes', async () => {
    const { service, client } = buildService(pendingChain());
    await service.review(ADMIN, 'doc-1', { action: 'approve', signatureId: 'sig-1', notes: '  No active infiltrates.  ' });
    expect(updatePayload(client).review_notes).toBe('No active infiltrates.');
  });

  it('stores null (not an empty string) when no findings were entered', async () => {
    const { service, client } = buildService(pendingChain());
    await service.review(ADMIN, 'doc-1', { action: 'approve', signatureId: 'sig-1', notes: '   ' });
    expect(updatePayload(client).review_notes).toBeNull();
  });
});

describe('DocumentsService.getReviewQueue — carries the due date through', () => {
  const ADMIN: EmployeeContext = { ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' };
  const base = {
    doc_type: 'APE', cxr_result: 'CLEARED', genexpert_result: 'NOT_APPLICABLE', titer_result: 'NOT_APPLICABLE', title: null, facility_name: null, notes: null,
    exam_date: '2026-06-15', uploaded_at: '2026-06-15T00:00:00Z',
    employees: { id: EMPLOYEE.id, employee_id: EMPLOYEE.employeeId, full_name: EMPLOYEE.fullName, job_title: null, department_id: EMPLOYEE.departmentId, departments: { name: 'Nursing', code: 'NUR' } },
  };

  it('maps the compliance record\'s due date (object or array form), and null for a Hep B Titer with no record', async () => {
    const { service } = buildService([
      { data: { code: 'ADMIN' }, error: null },
      { data: [
        { ...base, id: 'a', compliance_records: { due_date: '2026-09-03' } },
        { ...base, id: 'b', compliance_records: [{ due_date: '2026-09-02' }] },
        { ...base, id: 'c', doc_type: 'HEPB_TITER', compliance_records: null },
      ], error: null },
    ]);
    const rows = await service.getReviewQueue(ADMIN);
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-09-03', '2026-09-02', null]);
  });
});

describe('DocumentsService.getFileUrl — a short-lived link to view an uploaded file', () => {
  const OWNER_DOC = { id: 'doc-1', employee_id: EMPLOYEE.id, storage_path: `${EMPLOYEE.id}/file.pdf`, file_type: 'application/pdf' };

  function build(doc: unknown, ownerDept: string, currentDeptCode: string, signed: { data: { signedUrl: string } | null; error: unknown } = { data: { signedUrl: 'https://signed.example/file' }, error: null }) {
    const built = buildService([
      { data: doc, error: null }, // the document
      { data: { department_id: ownerDept }, error: null }, // its owner's department
      { data: { code: currentDeptCode }, error: null }, // the caller's own department code
    ]);
    const createSignedUrl = jest.fn().mockResolvedValue(signed);
    (built.client as unknown as { storage: unknown }).storage = { from: jest.fn(() => ({ createSignedUrl })) };
    return { ...built, createSignedUrl };
  }

  it('an admin gets a 5-minute signed link and the stored file type', async () => {
    const { service, createSignedUrl } = build(OWNER_DOC, 'dept-1', 'ADMIN');
    const result = await service.getFileUrl({ ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' }, 'doc-1');
    expect(result).toEqual({ url: 'https://signed.example/file', fileType: 'application/pdf', expiresInSeconds: 300 });
    expect(createSignedUrl).toHaveBeenCalledWith(OWNER_DOC.storage_path, 300);
  });

  it('the document\'s own owner can view it', async () => {
    const { service } = build(OWNER_DOC, 'dept-1', 'NUR');
    await expect(service.getFileUrl(EMPLOYEE, 'doc-1')).resolves.toMatchObject({ url: 'https://signed.example/file' });
  });

  it('another STAFF member cannot, and no link is ever created for them', async () => {
    const { service, createSignedUrl } = build(OWNER_DOC, 'dept-1', 'NUR');
    await expect(service.getFileUrl({ ...EMPLOYEE, id: 'someone-else' }, 'doc-1')).rejects.toMatchObject({ status: 403 });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('a unit head can view their own department\'s documents but not another department\'s', async () => {
    const head = { ...EMPLOYEE, id: 'head-1', role: 'UNIT_HEAD' as const, departmentId: 'dept-1' };
    await expect(build(OWNER_DOC, 'dept-1', 'NUR').service.getFileUrl(head, 'doc-1')).resolves.toBeDefined();
    await expect(build(OWNER_DOC, 'dept-2', 'NUR').service.getFileUrl(head, 'doc-1')).rejects.toMatchObject({ status: 403 });
  });

  it('404s for an unknown document, and when the stored file cannot be signed', async () => {
    await expect(build(null, 'dept-1', 'ADMIN').service.getFileUrl({ ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' }, 'nope')).rejects.toMatchObject({ status: 404 });
    const missing = build(OWNER_DOC, 'dept-1', 'ADMIN', { data: null, error: { message: 'Object not found' } });
    await expect(missing.service.getFileUrl({ ...EMPLOYEE, id: 'admin-1', role: 'ADMIN' }, 'doc-1')).rejects.toMatchObject({ status: 404 });
  });
});
