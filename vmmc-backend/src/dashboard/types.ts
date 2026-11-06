export interface MonthlyPoint {
  label: string;
  value: number;
}

export interface ScreeningChecklistItem {
  key: 'APE' | 'HEPB_TITER' | 'IMMUNIZATION';
  label: string;
  status: 'VERIFIED' | 'DUE' | 'MISSING';
  detail: string | null;
}

export interface ScreeningProgress {
  verifiedCount: number;
  total: number;
  percent: number;
  items: ScreeningChecklistItem[];
}

export interface StaffOverview {
  role: 'staff';
  employeeId: string;
  totalPersonnel: number;
  lastAuditedAt: string | null;
  nextDue: { date: string; progressPercent: number; triggerLabel: string } | null;
  department: { name: string; code: string; complianceRate: number; pendingStaffCount: number };
  urgentActiveActions: number;
  registryCompliance: number;
  reportsVerifiedToday: number;
  pendingActions: string;
  monthlyTrend: MonthlyPoint[];
  screeningProgress: ScreeningProgress;
}

/** Where a current-cycle record stands for the admin landing page's charts. "Up to date" is cleared, or
 * not cleared but with the deadline more than DUE_SOON_DAYS away; "overdue" is past the deadline uncleared. */
export type ClearanceBucket = 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE';

export interface DepartmentClearance {
  name: string;
  code: string;
  upToDate: number;
  dueSoon: number;
  overdue: number;
}

export interface FollowUpEntry {
  recordId: string;
  employeeId: string;
  fullName: string;
  department: string;
  module: string;
  dueDate: string;
  lastReminderAt: string | null;
}

export interface AdminOverview {
  role: 'admin';
  hospitalCompliance: { rate: number; trendDelta: number };
  totalPersonnel: number;
  criticalCases: number;
  annualClearanceProgress: { rate: number; monthlyBreakdown: MonthlyPoint[] };
  /** % of active staff with a record in the current cycle. */
  trackedPercent: number;
  /** Final clearance rate of the previous cycle, or null when there was no previous cycle on file. */
  previousCycleRate: number | null;
  clearanceCounts: { upToDate: number; dueSoon: number; overdue: number };
  departmentClearance: DepartmentClearance[];
  /** Overdue personnel, most overdue first, capped at FOLLOW_UP_LIMIT; followUpTotal is the uncapped count. */
  followUps: FollowUpEntry[];
  followUpTotal: number;
}
