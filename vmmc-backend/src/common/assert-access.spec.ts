import {
  assertDocumentAccess,
  buildEmployeeId,
  parseEmploymentTypeFromEmployeeId,
  validateEmployeeId,
} from './assert-access';

describe('employee identity rules', () => {
  it('marks permanent staff employee IDs as PERMANENT', () => {
    expect(parseEmploymentTypeFromEmployeeId('VMMC-25-0021')).toBe('PERMANENT');
  });

  it('marks contract-of-service employee IDs as COS', () => {
    expect(parseEmploymentTypeFromEmployeeId('VMMC-COS-25-1001')).toBe('COS');
  });

  it('builds the correct employee ID for each employment type', () => {
    expect(buildEmployeeId('PERMANENT', 2025, 21)).toBe('VMMC-25-0021');
    expect(buildEmployeeId('COS', 2025, 1001)).toBe('VMMC-COS-25-1001');
  });

  it('rejects a mismatched employment type when validating IDs', () => {
    expect(() => validateEmployeeId('VMMC-25-0021', 'COS')).toThrow('VMMC-COS-YY-NNNN');
  });
});

describe('document access rules', () => {
  it('allows an admin to view any department\'s documents', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'admin-1', role: 'ADMIN', departmentId: 'dept-admin' } as any,
        'dept-2',
        'emp-2',
        'LAB',
      ),
    ).not.toThrow();
  });

  it('allows a unit head (department head) to view documents in their own department', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'u1', role: 'UNIT_HEAD', departmentId: 'dept-1' } as any,
        'dept-1',
        'emp-2',
      ),
    ).not.toThrow();
  });

  it('blocks a unit head from another department from viewing the files', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'u2', role: 'UNIT_HEAD', departmentId: 'dept-2' } as any,
        'dept-1',
        'emp-2',
      ),
    ).toThrow();
  });

  it('blocks a plain staff member from reading a colleague\'s files in their own department', () => {
    // Tightened per the Aug 31 feedback: being in the same department is no longer
    // sufficient on its own — only the department head, TB DOTS staff, HR, or ADMIN qualify.
    expect(() =>
      assertDocumentAccess(
        { id: 'staff-1', role: 'STAFF', departmentId: 'dept-1' } as any,
        'dept-1',
        'emp-2',
      ),
    ).toThrow();
  });

  it('allows a staff member to access their own record even outside their department', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'emp-2', role: 'STAFF', departmentId: 'dept-1' } as any,
        'dept-2',
        'emp-2',
      ),
    ).not.toThrow();
  });

  it('allows HR department staff to access documents across departments', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'hr-1', role: 'STAFF', departmentId: 'dept-hr' } as any,
        'dept-1',
        'emp-2',
        'HR',
      ),
    ).not.toThrow();
  });

  it('allows TB DOTS Program staff to access documents across departments', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'tbdots-1', role: 'STAFF', departmentId: 'dept-tbdots' } as any,
        'dept-1',
        'emp-2',
        'TBDOTS',
      ),
    ).not.toThrow();
  });

  it('blocks a random staff member from reading another department\'s files', () => {
    expect(() =>
      assertDocumentAccess(
        { id: 'staff-1', role: 'STAFF', departmentId: 'dept-1' } as any,
        'dept-2',
        'emp-2',
      ),
    ).toThrow();
  });
});
