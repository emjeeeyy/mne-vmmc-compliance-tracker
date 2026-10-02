import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transporter, createTransport } from 'nodemailer';
import { ChannelResult } from './sms.channel';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends via SMTP (e.g. a Gmail App Password) when SMTP_USER/SMTP_PASSWORD are
 * configured; otherwise logs what would have been sent so the flow is demoable
 * at zero cost.
 */
@Injectable()
export class EmailChannel implements OnModuleInit {
  private readonly logger = new Logger(EmailChannel.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const user = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    if (!user || !password) return;

    this.fromAddress = user;
    this.transporter = createTransport({
      host: this.configService.get<string>('SMTP_HOST') ?? 'smtp.gmail.com',
      port: this.configService.get<number>('SMTP_PORT') ?? 587,
      secure: false,
      auth: { user, pass: password },
    });
  }

  /** `html` is optional so any existing plain-text call site keeps working
   * unchanged — pass it (see `src/notifications/email-templates/`) to send the
   * designed version; `message` always ships too, as the plain-text part
   * every multipart email needs for clients/screen readers that don't render HTML. */
  async send(to: string, subject: string, message: string, html?: string): Promise<ChannelResult> {
    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] to ${to}: ${subject} — ${message}`);
      return { status: 'LOGGED', providerRef: null, retryCount: 0 };
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
      try {
        const info = await this.transporter.sendMail({
          from: `VMMC TB DOTS <${this.fromAddress}>`,
          to,
          subject,
          text: message,
          ...(html ? { html } : {}),
        });
        return { status: 'SENT', providerRef: info.messageId ?? null, retryCount: attempt };
      } catch (err) {
        lastError = err;
      }
    }

    this.logger.error(`Email to ${to} failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
    return { status: 'FAILED', providerRef: null, retryCount: MAX_ATTEMPTS };
  }
}
