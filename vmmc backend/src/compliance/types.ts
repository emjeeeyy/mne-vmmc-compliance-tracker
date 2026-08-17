export type ComplianceState = 'COMPLIANT' | 'PENDING' | 'NON_COMPLIANT' | 'OVERDUE';
export type ClinicalStatus = 'COMPLIANT' | 'CRITICAL' | 'PENDING';
export type CxrResult = 'CLEARED' | 'INFILTRATE' | 'PENDING' | 'NOT_APPLICABLE';
export type GeneXpertResult = 'NOT_DETECTED' | 'DETECTED' | 'PENDING' | 'NOT_APPLICABLE';

export interface TrackerEntry {
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  department: { id: string; name: string; code: string };
  status: ComplianceState;
  clinicalStatus: ClinicalStatus;
  dueDate: string;
  cxrResult: CxrResult;
  genexpertResult: GeneXpertResult;
  examDate: string | null;
}

export interface DossierResponse extends TrackerEntry {
  id: string;
  email: string;
  phone: string | null;
  cycleYear: number;
  windowOpenDate: string;
  birthdayDate: string;
  documents: unknown[];
}
