export interface MonthlyPoint {
  label: string;
  value: number;
}

export interface StaffOverview {
  role: 'staff';
  nextDue: { date: string; progressPercent: number; triggerLabel: string } | null;
  department: { name: string; code: string; complianceRate: number; pendingStaffCount: number };
  urgentActiveActions: number;
  registryCompliance: number;
  reportsVerifiedToday: number;
  pendingActions: string;
  monthlyTrend: MonthlyPoint[];
}

export interface AdminOverview {
  role: 'admin';
  hospitalCompliance: { rate: number; trendDelta: number };
  totalPersonnel: number;
  criticalCases: number;
  annualClearanceProgress: { rate: number; monthlyBreakdown: MonthlyPoint[] };
}
