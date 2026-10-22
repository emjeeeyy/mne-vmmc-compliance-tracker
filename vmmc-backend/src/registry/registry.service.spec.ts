import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { ComplianceRecordService } from '../compliance/compliance-record.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RegistryService } from './registry.service';

const EMPLOYEE = { id: 'emp-1', employee_id: 'VMMC-21-0012', full_name: 'Dr. Roberto Santos', job_title: 'Consultant Pulmonologist', departments: { name: 'Pulmonology / TB DOTS' } };
const DOCUMENT = {
  cxr_result: 'CLEARED',
  genexpert_result: 'NOT_DETECTED',
  exam_date: '2026-09-05',
  reviewed_at: '2026-09-05T08:30:00Z',
  reviewed_by: 'admin-1',
  signature_id: 'sig-1',
};

function build(chainResults: { data: unknown; error: unknown }[], signedUrl: { data: { signedUrl: string } | null; error: unknown } = { data: { signedUrl: 'https://signed.example/sig.png' }, error: null }) {
  const { client, calls } = createSupabaseClientMock(chainResults);
  const createSignedUrl = jest.fn().mockResolvedValue(signedUrl);
  (client as unknown as { storage: unknown }).storage = { from: jest.fn(() => ({ createSignedUrl })) };
  const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
  const complianceRecordService = { ensureCurrentCycleRecords: jest.fn().mockResolvedValue(undefined) } as unknown as ComplianceRecordService;
  return { service: new RegistryService(supabaseService, complianceRecordService), calls, createSignedUrl };
}

/** Queue order follows getClearanceCertificate top to bottom: employee, record, document, reviewer, signature row. */
const clearedChain = (overrides: { record?: object; document?: object } = {}) => [
  { data: EMPLOYEE, error: null },
  { data: { status: 'COMPLIANT', clinical_status: 'COMPLIANT', due_date: '2026-09-30', approved_document_id: 'doc-1', ...overrides.record }, error: null },
  { data: { ...DOCUMENT, ...overrides.document }, error: null },
  { data: { full_name: 'Dr. Maria Teresa Ramos', job_title: 'TB DOTS Lead' }, error: null },
  { data: { signature_path: 'admin-1/sig.png' }, error: null },
];

describe('RegistryService.getClearanceCertificate — only ever issued to someone who is actually cleared', () => {
  it('builds the certificate from the approved exam, its reviewer and their signature', async () => {
    const { service, createSignedUrl } = build(clearedChain());
    const cert = await service.getClearanceCertificate('emp-1');
    expect(cert).toEqual({
      employee: { fullName: 'Dr. Roberto Santos', employeeId: 'VMMC-21-0012', jobTitle: 'Consultant Pulmonologist', department: 'Pulmonology / TB DOTS' },
      cxrResult: 'CLEARED',
      genexpertResult: 'NOT_DETECTED',
      examDate: '2026-09-05',
      issuedAt: '2026-09-05T08:30:00Z',
      validUntil: '2027-09-30', // the next cycle's month-end deadline
      signatory: { fullName: 'Dr. Maria Teresa Ramos', jobTitle: 'TB DOTS Lead', signatureUrl: 'https://signed.example/sig.png' },
    });
    expect(createSignedUrl).toHaveBeenCalledWith('admin-1/sig.png', 900);
  });

  it('404s for an unknown employee', async () => {
    await expect(build([{ data: null, error: null }]).service.getClearanceCertificate('nope')).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['not cleared this cycle', { status: 'PENDING' }],
    ['cleared but no approved document linked', { approved_document_id: null }],
  ])('409s when %s — a fit-for-duty declaration cannot be obtained for anyone else', async (_label, record) => {
    const { service } = build(clearedChain({ record }));
    await expect(service.getClearanceCertificate('emp-1')).rejects.toMatchObject({ status: 409 });
  });

  it('409s while a clinical alert is open, even though the paperwork is approved', async () => {
    const { service } = build(clearedChain({ record: { clinical_status: 'CRITICAL' } }));
    await expect(service.getClearanceCertificate('emp-1')).rejects.toMatchObject({ status: 409 });
  });

  it('409s when the approved exam has no reviewer on record', async () => {
    const { service } = build(clearedChain({ document: { reviewed_by: null } }));
    await expect(service.getClearanceCertificate('emp-1')).rejects.toMatchObject({ status: 409 });
  });

  it('still issues the certificate, without a signature image, when the image cannot be signed', async () => {
    const { service } = build(clearedChain(), { data: null, error: { message: 'Object not found' } });
    const cert = await service.getClearanceCertificate('emp-1');
    expect(cert.signatory).toMatchObject({ fullName: 'Dr. Maria Teresa Ramos', signatureUrl: null });
  });

  it('no signature on the approval at all -> typed signatory only', async () => {
    const { service, createSignedUrl } = build(clearedChain({ document: { signature_id: null } }).slice(0, 4));
    const cert = await service.getClearanceCertificate('emp-1');
    expect(cert.signatory.signatureUrl).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
