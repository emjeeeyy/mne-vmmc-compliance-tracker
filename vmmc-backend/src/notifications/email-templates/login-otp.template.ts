import { wrapEmail, COLORS, FONT } from './layout';
import { greeting, heading, otpCodeBox, sectionPad } from './components';
import { BuiltEmail } from './otp.template';

export interface LoginOtpEmailParams {
  name: string;
  code: string;
  expiresMinutes: number;
  requestedAt: Date;
}

/** Deliberately separate copy from buildOtpEmail() even though the visual shell is identical —
 * reusing the password-reset wording verbatim here would tell someone who just logged in
 * normally that "we received a request to reset your password," which is both wrong and alarming.
 * This is also the natural place to warn someone if a login attempt wasn't actually them. */
export function buildLoginOtpEmail({ name, code, expiresMinutes, requestedAt }: LoginOtpEmailParams): BuiltEmail {
  const time = requestedAt.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

  const bodyHtml = `
    <div ${sectionPad('28px 32px 8px')}>
      <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.green};">Login Verification</p>
      ${heading("Here's your login code")}
      ${greeting(name, `Someone is signing in to your VMMC TB DOTS Surveillance account with your Employee ID and password. Enter the code below to finish signing in — it expires in ${expiresMinutes} minutes.`)}
    </div>
    <div ${sectionPad('0 32px 28px')}>
      ${otpCodeBox(code, `Expires in ${expiresMinutes} minutes &middot; requested at ${time}`)}
    </div>
    <div ${sectionPad('0 32px 32px')}>
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};"><strong style="color:${COLORS.red};">Wasn't you?</strong> Someone else may have your password. Change it immediately from Profile &gt; Account Security, and consider reviewing your recent login history.</p>
    </div>
  `;

  return {
    subject: 'VMMC TB DOTS — Your login code',
    html: wrapEmail({ bodyHtml }),
    text: `Hi ${name},\n\nSomeone is signing in to your VMMC TB DOTS account. Your login code is ${code}. It expires in ${expiresMinutes} minutes.\n\nWasn't you? Someone else may have your password — change it immediately.`,
  };
}
