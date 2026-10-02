import { wrapEmail, COLORS } from './layout';
import { badge, ctaButton, detailTable, greeting, heading, sectionPad, DetailRow, Tier } from './components';
import { BuiltEmail } from './otp.template';

export interface EventEmailParams {
  name: string;
  employeeId: string;
  subtype: string;
  message: string;
  detectedAt: Date;
  dueDate?: string | null;
  appBaseUrl: string;
}

function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Manila' });
}

interface SubtypeContent {
  subject: string;
  tier: Tier;
  badgeLabel: string;
  headline: string;
  rows: (p: EventEmailParams) => DetailRow[];
  cta: (p: EventEmailParams) => { label: string; href: string; color?: string };
}

const SUBTYPE_CONTENT: Record<string, SubtypeContent> = {
  FIRST_REMINDER: {
    subject: 'Your VMMC clearance window is open',
    tier: 'warning',
    badgeLabel: 'Reminder',
    headline: 'Your clearance window is open',
    rows: (p) => [
      { label: 'Window Opened', value: formatDate(p.detectedAt) },
      { label: 'Deadline (Your Birth Month)', value: p.dueDate ? formatDate(p.dueDate) : '—' },
    ],
    cta: (p) => ({ label: 'Upload Your Results', href: `${p.appBaseUrl}/upload` }),
  },
  BIRTHDAY_DUE: {
    subject: 'Your VMMC clearance is due today',
    tier: 'warning',
    badgeLabel: 'Due Today',
    headline: 'Your clearance is due today',
    rows: (p) => [
      { label: 'Due Date', value: `Today, ${formatDate(p.detectedAt)}`, emphasis: 'danger' },
      { label: 'If No Submission', value: 'Status → Non-Compliant' },
    ],
    cta: (p) => ({ label: 'Upload Your Results', href: `${p.appBaseUrl}/upload` }),
  },
  WEEKLY_REMINDER: {
    subject: 'Your VMMC clearance is still pending',
    tier: 'warning',
    badgeLabel: 'Still Pending',
    headline: 'Your annual clearance is still pending',
    rows: (p) => [
      { label: 'Reminder Sent', value: formatDate(p.detectedAt) },
      { label: 'Current Status', value: 'Non-Compliant' },
    ],
    cta: (p) => ({ label: 'Upload Your Results', href: `${p.appBaseUrl}/upload` }),
  },
  THREE_MONTH_HR_NOTICE: {
    subject: 'Action required: 3 months non-compliant',
    tier: 'exception',
    badgeLabel: '90+ Days Overdue',
    headline: "You've been non-compliant for 3 months",
    rows: (p) => [
      { label: 'Flagged On', value: formatDate(p.detectedAt) },
      { label: 'Escalated To', value: 'HR Department' },
    ],
    cta: (p) => ({ label: 'Upload Your Results', href: `${p.appBaseUrl}/upload` }),
  },
  SLA_BREACH: {
    subject: 'Your VMMC clearance deadline has passed',
    tier: 'exception',
    badgeLabel: 'Action Required',
    headline: 'Your clearance deadline has passed',
    rows: (p) => [
      { label: 'Employee', value: p.employeeId },
      { label: 'Deadline', value: p.dueDate ? formatDate(p.dueDate) : formatDate(p.detectedAt), emphasis: 'danger' },
    ],
    cta: (p) => ({ label: 'View Compliance Record', href: `${p.appBaseUrl}/compliance` }),
  },
  CLINICAL_ALERT: {
    subject: 'Urgent: your result requires clinical review',
    tier: 'exception',
    badgeLabel: 'Urgent · Clinical Review',
    headline: 'Your result requires immediate review',
    rows: () => [
      { label: 'Clinical Status', value: 'Critical', emphasis: 'danger' },
      { label: 'Flagged On', value: formatDate(new Date()) },
    ],
    cta: (p) => ({ label: 'Contact TB DOTS Office', href: `${p.appBaseUrl}/compliance`, color: COLORS.red }),
  },
  PEP_FOLLOWUP_MISSED: {
    subject: 'Your post-exposure follow-up is overdue',
    tier: 'warning',
    badgeLabel: 'Follow-Up Overdue',
    headline: 'Your post-exposure follow-up is overdue',
    rows: (p) => [{ label: 'Flagged On', value: formatDate(p.detectedAt) }],
    cta: (p) => ({ label: 'Schedule Follow-Up', href: `${p.appBaseUrl}/upload` }),
  },
  IMMUNIZATION_OVERDUE: {
    subject: 'Your next vaccine dose is overdue',
    tier: 'warning',
    badgeLabel: 'Dose Overdue',
    headline: 'Your next vaccine dose is overdue',
    rows: (p) => [{ label: 'Flagged On', value: formatDate(p.detectedAt) }],
    cta: (p) => ({ label: 'Schedule Dose', href: `${p.appBaseUrl}/upload` }),
  },
  DOCUMENT_REJECTED: {
    subject: "Your submitted result wasn't approved",
    tier: 'exception',
    badgeLabel: 'Resubmission Needed',
    headline: "Your submitted result wasn't approved",
    rows: (p) => [{ label: 'Reviewed On', value: formatDate(p.detectedAt) }],
    cta: (p) => ({ label: 'Resubmit Your Results', href: `${p.appBaseUrl}/upload` }),
  },
};

/** Generic, safe fallback for any subtype without a designed template above —
 * degrades to a plain readable email rather than throwing, since a new event
 * subtype shipping without matching email design shouldn't break delivery. */
const FALLBACK_CONTENT: SubtypeContent = {
  subject: 'VMMC TB DOTS Notification',
  tier: 'warning',
  badgeLabel: 'Notice',
  headline: 'You have a new notification',
  rows: (p) => [{ label: 'Detected', value: formatDate(p.detectedAt) }],
  cta: (p) => ({ label: 'Open VMMC Surveillance', href: p.appBaseUrl }),
};

export function buildEventEmail(params: EventEmailParams): BuiltEmail {
  const content = SUBTYPE_CONTENT[params.subtype] ?? FALLBACK_CONTENT;
  const cta = content.cta(params);
  const accentColor = content.tier === 'exception' ? COLORS.redAccent : undefined;

  const bodyHtml = `
    <div ${sectionPad('28px 32px 8px')}>
      ${badge(content.badgeLabel, content.tier)}
      ${heading(content.headline)}
      ${greeting(params.name, params.message)}
    </div>
    <div ${sectionPad('0 32px 28px')}>
      ${detailTable(content.rows(params), content.tier === 'exception' ? 'exception' : undefined)}
    </div>
    <div ${sectionPad('0 32px 32px')} align="center">
      ${ctaButton(cta.label, cta.href, cta.color)}
    </div>
  `;

  return {
    subject: content.subject,
    html: wrapEmail({ accentColor, bodyHtml }),
    text: `Hi ${params.name},\n\n${params.message}\n\nOpen VMMC Surveillance: ${cta.href}`,
  };
}
