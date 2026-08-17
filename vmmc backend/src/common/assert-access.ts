import { ForbiddenException } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';

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
