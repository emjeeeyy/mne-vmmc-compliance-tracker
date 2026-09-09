import { ForbiddenException } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';

export type EmploymentType = 'PERMANENT' | 'COS';

export function buildEmployeeId(employmentType: EmploymentType, year: number, sequence: number): string {
  const yearSuffix = String(year).slice(-2);
  const sequenceSuffix = String(sequence).padStart(4, '0');
  return employmentType === 'COS' ? `VMMC-COS-${yearSuffix}-${sequenceSuffix}` : `VMMC-${yearSuffix}-${sequenceSuffix}`;
}

export function validateEmployeeId(employeeId: string, expectedType?: EmploymentType): string {
  const normalized = employeeId?.trim();
  if (!normalized) throw new Error('Employee ID is required.');

  if (expectedType === 'COS' && !/^VMMC-COS-\d{2}-\d{4}$/i.test(normalized)) {
    throw new Error('COS employee ID must match VMMC-COS-YY-NNNN.');
  }

  if (expectedType === 'PERMANENT' && !/^VMMC-\d{2}-\d{4}$/i.test(normalized)) {
    throw new Error('Permanent employee ID must match VMMC-YY-NNNN.');
  }

  if (/^VMMC-COS-\d{2}-\d{4}$/i.test(normalized) || /^VMMC-\d{2}-\d{4}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  throw new Error('Employee ID must match VMMC-YY-NNNN or VMMC-COS-YY-NNNN.');
}

/**
 * Distinguishes the employee ID format used for permanent staff versus COS staff.
 * Permanent staff keep the legacy VMMC-YY-NNNN shape; COS entries are explicitly tagged.
 */
export function parseEmploymentTypeFromEmployeeId(employeeId: string): EmploymentType {
  if (!employeeId) return 'PERMANENT';
  return /^VMMC-COS-\d{2}-\d{4}$/i.test(employeeId) ? 'COS' : 'PERMANENT';
}

/**
 * Shared cross-employee-record access rule (same model as Compliance
 * dossier/report access): ADMIN sees everything, UNIT_HEAD is scoped to
 * their own department, STAFF may only view their own record.
 */
export function assertRecordAccess(currentUser: EmployeeContext, targetDepartmentId: string, targetEmployeeId: string) {
  if (currentUser.role === 'ADMIN') return;
  if (currentUser.role === 'UNIT_HEAD' && currentUser.departmentId === targetDepartmentId) return;
  if (currentUser.role === 'STAFF' && currentUser.id === targetEmployeeId) return;
  throw new ForbiddenException('You do not have permission to view this record.');
}

/**
 * Document access is desktop-first and department-scoped:
 * - ADMIN sees all uploaded files
 * - UNIT_HEAD may access their own department's documents
 * - STAFF may access documents from their own department
 * - HR staff may access documents across departments
 */
export function assertDocumentAccess(
  currentUser: Pick<EmployeeContext, 'id' | 'role' | 'departmentId'>,
  targetDepartmentId: string,
  targetEmployeeId: string,
  targetDepartmentCode?: string,
  currentUserDepartmentCode?: string,
) {
  if (currentUser.role === 'ADMIN') return;
  if (currentUser.role === 'UNIT_HEAD' && currentUser.departmentId === targetDepartmentId) return;

  if (currentUser.role === 'STAFF') {
    if (currentUser.id === targetEmployeeId) return;
    if (currentUser.departmentId === targetDepartmentId) return;
    if ((currentUserDepartmentCode ?? '').toUpperCase() === 'HR') return;
    if ((targetDepartmentCode ?? '').toUpperCase() === 'HR' && currentUser.departmentId === targetDepartmentId) return;
  }

  throw new ForbiddenException('You do not have permission to access this document.');
}
