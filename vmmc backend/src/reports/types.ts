export interface DelinquencyRow {
  employeeId: string;
  fullName: string;
  department: string;
  status: 'NON_COMPLIANT' | 'OVERDUE';
  dueDate: string;
  daysOverdue: number;
}

export interface ClearanceSummaryRow {
  department: string;
  departmentCode: string;
  totalEmployees: number;
  compliant: number;
  pending: number;
  nonCompliant: number;
  overdue: number;
  complianceRate: number;
}

export interface BiologicalMatrixRow {
  employeeId: string;
  fullName: string;
  department: string;
  exposureDate: string;
  exposureType: string;
  prophylaxisStatus: string;
  followUpDate: string | null;
  notes: string | null;
}

export interface PiiIndexRow {
  employeeId: string;
  fullName: string;
  employmentType: 'PERMANENT' | 'COS';
  department: string;
  jobTitle: string | null;
  email: string;
  phone: string | null;
  birthDate: string;
  role: string;
}
