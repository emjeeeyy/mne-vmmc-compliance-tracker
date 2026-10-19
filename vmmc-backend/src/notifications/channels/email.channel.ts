import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelResult } from './sms.channel';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends via Brevo's HTTP API (plain HTTPS, not SMTP) when BREVO_API_KEY/EMAIL_FROM are
 * configured; otherwise logs what would have been sent so the flow is demoable at zero
 * cost. HTTP instead of raw SMTP deliberately: Railway's outbound network couldn't
 * reliably reach Gmail's SMTP port at all (confirmed live — ENETUNREACH on a random
 * IPv6 pick, then a straight connection timeout even forcing IPv4), while a plain
 * HTTPS POST has none of that risk — same reasoning SmsChannel already applies to
 * Semaphore, now mirrored here instead of nodemailer owning a raw socket.
 */
@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(private readonly configService: ConfigService) {}

  /** `html` is optional so any existing plain-text call site keeps working
   * unchanged — pass it (see `src/notifications/email-templates/`) to send the
   * designed version; `message` always ships too, as the plain-text part
   * every multipart email needs for clients/screen readers that don't render HTML. */
  async send(to: string, subject: string, message: string, html?: string): Promise<ChannelResult> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const fromAddress = this.configService.get<string>('EMAIL_FROM');
    if (!apiKey || !fromAddress) {
      this.logger.log(`[DEV EMAIL] to ${to}: ${subject} — ${message}`);
      return { status: 'LOGGED', providerRef: null, retryCount: 0 };
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
      try {
        const res = await fetch(BREVO_URL, {
          method: 'POST',
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender: { name: 'VMMC TB DOTS', email: fromAddress },
            to: [{ email: to }],
            subject,
            textContent: message,
            ...(html ? { htmlContent: html } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as { messageId?: string };
        return { status: 'SENT', providerRef: data.messageId ?? null, retryCount: attempt };
      } catch (err) {
        lastError = err;
      }
    }

    this.logger.error(`Email to ${to} failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
    return { status: 'FAILED', providerRef: null, retryCount: MAX_ATTEMPTS };
  }
}
