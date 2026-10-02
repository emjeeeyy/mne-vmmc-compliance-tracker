export type Role = 'STAFF' | 'UNIT_HEAD' | 'ADMIN';

export interface EmployeeContext {
  id: string;
  authUserId: string;
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  email: string;
  role: Role;
  departmentId: string;
  birthDate: string;
}
