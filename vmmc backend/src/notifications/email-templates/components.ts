import { COLORS, FONT, FONT_HEADING } from './layout';

export type Tier = 'info' | 'warning' | 'exception';

const TIER_COLORS: Record<Tier, { bg: string; color: string; border: string }> = {
  info: { bg: COLORS.greenBg, color: COLORS.green, border: COLORS.greenBorder },
  warning: { bg: COLORS.amberBg, color: COLORS.amber, border: COLORS.amberBorder },
  exception: { bg: COLORS.redBg, color: COLORS.red, border: COLORS.redBorder },
};

/** `padding:<v>` plus the class the layout's narrow-screen media query targets
 * to tighten side padding on a phone-width client — every section in a
 * template body should use this instead of a bare inline `padding`. */
export function sectionPad(padding: string): string {
  return `class="email-pad-lg" style="padding:${padding};"`;
}

export function badge(label: string, tier: Tier): string {
  const c = TIER_COLORS[tier];
  return `<span style="display:inline-block;background:${c.bg};color:${c.color};border:1px solid ${c.border};border-radius:999px;padding:5px 14px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">${label}</span>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:16px 0 18px;font-family:${FONT_HEADING};font-size:21px;font-weight:700;color:${COLORS.ink};">${text}</h1>`;
}

export function greeting(name: string, bodyText: string): string {
  return `<p style="margin:0 0 20px;font-family:${FONT};font-size:14px;line-height:1.6;color:${COLORS.body};">Hi ${name},<br>${bodyText}</p>`;
}

export interface DetailRow {
  label: string;
  value: string;
  emphasis?: 'danger' | 'default';
}

/** The label/value table used under every headline — plain gray surface for
 * neutral facts, or a tier-tinted surface (matching `tier`) when the whole
 * block itself needs to read as urgent (e.g. Clinical Alert's status table). */
export function detailTable(rows: DetailRow[], tier?: Tier): string {
  const tinted = tier && tier !== 'info' ? TIER_COLORS[tier] : null;
  const bg = tinted ? tinted.bg : COLORS.surfaceMuted;
  const border = tinted ? `border:1px solid ${tinted.border};` : '';
  const labelColor = tinted ? tinted.color : COLORS.muted;
  const rowsHtml = rows
    .map((r, i) => {
      const valueColor = r.emphasis === 'danger' ? COLORS.red : COLORS.ink;
      const borderTop = i === 0 ? '' : `border-top:1px solid ${tinted ? tinted.border : COLORS.line};padding-top:14px;`;
      return `<tr>
        <td style="padding:${i === 0 ? '14px' : '0 0 14px'} 16px;font-family:${FONT};font-size:12px;color:${labelColor};font-weight:700;text-transform:uppercase;letter-spacing:0.04em;${borderTop}">${r.label}</td>
        <td style="padding:${i === 0 ? '14px' : '0 0 14px'} 16px;font-family:${FONT};font-size:12px;color:${valueColor};font-weight:700;text-align:right;${borderTop}">${r.value}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};${border}border-radius:12px;">${rowsHtml}</table>`;
}

export function ctaButton(label: string, href: string, color: string = COLORS.navy): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${color};"><a href="${href}" style="display:inline-block;padding:14px 32px;font-family:${FONT_HEADING};font-size:13px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${label}</a></td></tr></table>`;
}

export function otpCodeBox(code: string, footnote: string): string {
  const spaced = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.surfaceMuted};border:1px solid ${COLORS.line};border-radius:14px;">
    <tr><td style="padding:22px;text-align:center;">
      <span style="font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${COLORS.ink};">${spaced}</span>
    </td></tr>
  </table>
  <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;color:${COLORS.muted};text-align:center;">${footnote}</p>`;
}
