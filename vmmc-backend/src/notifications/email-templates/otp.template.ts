import { wrapEmail, COLORS, FONT } from './layout';
import { greeting, heading, otpCodeBox, sectionPad } from './components';

export interface OtpEmailParams {
  name: string;
  code: string;
  expiresMinutes: number;
  requestedAt: Date;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildOtpEmail({ name, code, expiresMinutes, requestedAt }: OtpEmailParams): BuiltEmail {
  const time = requestedAt.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

  const bodyHtml = `
    <div ${sectionPad('28px 32px 8px')}>
      <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.green};">Password Reset</p>
      ${heading("Here's your verification code")}
      ${greeting(name, `We received a request to reset the password on your VMMC TB DOTS Surveillance account. Use the code below to continue — it expires in ${expiresMinutes} minutes.`)}
    </div>
    <div ${sectionPad('0 32px 28px')}>
      ${otpCodeBox(code, `Expires in ${expiresMinutes} minutes &middot; requested at ${time}`)}
    </div>
    <div ${sectionPad('0 32px 32px')}>
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};">Didn't request this? You can safely ignore this email — your password won't change unless this code is used.</p>
    </div>
  `;

  return {
    subject: 'VMMC TB DOTS — Password reset code',
    html: wrapEmail({ bodyHtml }),
    text: `Hi ${name},\n\nYour VMMC TB DOTS password reset code is ${code}. It expires in ${expiresMinutes} minutes.\n\nIf you didn't request this, you can ignore this email.`,
  };
}
