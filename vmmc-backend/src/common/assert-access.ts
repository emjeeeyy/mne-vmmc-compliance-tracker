import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';

export type EmploymentType = 'PERMANENT' | 'COS';

export function buildEmployeeId(employmentType: EmploymentType, year: number, sequence: number): string {
  const yearSuffix = String(year).slice(-2);
  const sequenceSuffix = String(sequence).padStart(4, '0');
  return employmentType === 'COS' ? `VMMC-COS-${yearSuffix}-${sequenceSuffix}` : `VMMC-${yearSuffix}-${sequenceSuffix}`;
}

// BadRequestException, not a plain Error — AllExceptionsFilter deliberately sanitizes any
// non-HttpException down to a generic "Internal server error." (500), a real security boundary
// for genuinely unexpected crashes. A plain Error here meant this function's own specific,
// correct messages ("Permanent employee ID must match VMMC-YY-NNNN.") never reached the user —
// every bad-format signup attempt showed a scary 500 instead, caught live typing an email address
// into the Employee ID field on signup instead of a real ID.
export function validateEmployeeId(employeeId: string, expectedType?: EmploymentType): string {
  const normalized = employeeId?.trim();
  if (!normalized) throw new BadRequestException('Employee ID is required.');

  if (expectedType === 'COS' && !/^VMMC-COS-\d{2}-\d{4}$/i.test(normalized)) {
    throw new BadRequestException('COS employee ID must match VMMC-COS-YY-NNNN.');
  }

  if (expectedType === 'PERMANENT' && !/^VMMC-\d{2}-\d{4}$/i.test(normalized)) {
    throw new BadRequestException('Permanent employee ID must match VMMC-YY-NNNN.');
  }

  if (/^VMMC-COS-\d{2}-\d{4}$/i.test(normalized) || /^VMMC-\d{2}-\d{4}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  throw new BadRequestException('Employee ID must match VMMC-YY-NNNN or VMMC-COS-YY-NNNN.');
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
 * Document access is restricted to those with an actual clinical/administrative
 * need to see it, not "anyone in the same department":
 * - ADMIN sees all uploaded files (absorbs TB Head clinical duties)
 * - Every employee may always see their own documents
 * - UNIT_HEAD (department head) may access their own department's documents
 * - TB DOTS Program and HR department staff may access documents across every department
 *
 * A plain STAFF member outside TB DOTS/HR gets none of the above beyond their own
 * record — deliberately narrower than "any staff in their own department", which is
 * what this function used to allow until the Aug 31 feedback flagged it as too broad.
 */
export function assertDocumentAccess(
  currentUser: Pick<EmployeeContext, 'id' | 'role' | 'departmentId'>,
  targetDepartmentId: string,
  targetEmployeeId: string,
  currentUserDepartmentCode?: string,
) {
  if (currentUser.role === 'ADMIN') return;
  if (currentUser.id === targetEmployeeId) return;
  if (currentUser.role === 'UNIT_HEAD' && currentUser.departmentId === targetDepartmentId) return;

  const currentCode = (currentUserDepartmentCode ?? '').toUpperCase();
  if (currentCode === 'HR' || currentCode === 'TBDOTS') return;

  throw new ForbiddenException('You do not have permission to access this document.');
}
