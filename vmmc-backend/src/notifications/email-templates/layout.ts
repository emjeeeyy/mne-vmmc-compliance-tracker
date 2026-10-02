/**
 * Shared chrome (header/footer/outer table) for every transactional email, plus
 * the color tokens every template/component draws from. All contrast-audited
 * (computed ratios, not eyeballed) against the WCAG 4.5:1 floor this app
 * enforces everywhere else — see docs/HANDOFF.md for the specific numbers.
 *
 * Deliberately plain HTML-in-TS (table layout, inline styles, `Segoe UI`/Arial
 * fallback stack) rather than the app's usual Tailwind/flexbox convention —
 * email clients (Outlook especially) don't support modern CSS, so this is a
 * different rendering target with its own rules, not an inconsistency.
 */

export const COLORS = {
  navy: '#1f3151',
  navyDeep: '#1c4b6e',
  ink: '#1f3151',
  body: '#4a5568',
  muted: '#64748b',
  line: '#e2e8f0',
  surfaceMuted: '#f8fafc',
  green: '#006633',
  greenBg: '#e6f9ee',
  greenBorder: '#9ae6b4',
  amber: '#92400e',
  amberBg: '#fffbea',
  amberBorder: '#f6e05e',
  red: '#c53030',
  redBg: '#fff5f5',
  redBorder: '#feb2b2',
  redAccent: '#e53e3e',
} as const;

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_HEADING = "'Segoe UI', Arial, sans-serif";

/** The one responsive concession this needs — a fluid `max-width:600px` table
 * already reflows to any width, but padding meant for a desktop inbox reads
 * cramped-yet-oversized on a phone-width client, so narrow screens get a
 * tighter version via a real `@media` query, not a second template. */
const RESPONSIVE_STYLE = `
  @media screen and (max-width: 480px) {
    .email-card { border-radius: 0 !important; }
    .email-pad-lg { padding-left: 20px !important; padding-right: 20px !important; }
    .email-header { padding: 22px 20px !important; }
  }
`;

export function wrapEmail(options: { accentColor?: string; bodyHtml: string }): string {
  const { accentColor, bodyHtml } = options;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${RESPONSIVE_STYLE}</style>
</head>
<body style="margin:0;background:#eef1f5;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="email-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
  <tr><td class="email-header" style="background:linear-gradient(135deg,${COLORS.navy} 0%,${COLORS.navyDeep} 100%);background-color:${COLORS.navy};padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${FONT_HEADING};">
      <span style="display:inline-block;width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,0.14);color:#ffffff;font-weight:700;font-size:13px;text-align:center;line-height:34px;vertical-align:middle;">V</span>
      <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;">VMMC <span style="color:#4ade80;">SURVEILLANCE</span></span>
    </td></tr></table>
  </td></tr>
  ${accentColor ? `<tr><td style="padding:4px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:-2px;"><tr><td style="height:4px;background:${accentColor};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` : ''}
  <tr><td>${bodyHtml}</td></tr>
  <tr><td style="padding:20px 32px;background:${COLORS.surfaceMuted};border-top:1px solid ${COLORS.line};">
    <p style="margin:0;font-family:${FONT};font-size:11px;color:${COLORS.muted};text-align:center;">Veterans Memorial Medical Center &middot; TB DOTS Pulmonary Surveillance<br>This is an automated message — please don't reply directly to this email.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export { FONT, FONT_HEADING };
