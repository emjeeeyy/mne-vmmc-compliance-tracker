import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transporter, createTransport } from 'nodemailer';
import { resolve4 } from 'dns/promises';
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

  async onModuleInit() {
    const user = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    if (!user || !password) return;

    this.fromAddress = user;
    const host = this.configService.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';

    // Railway's containers report an IPv6-capable network interface that isn't actually
    // routable to the internet. Nodemailer resolves both A and AAAA records for the SMTP
    // host and picks a *random* one to connect to — observed for real in production: roughly
    // half the time it picks the unreachable IPv6 address and the connection fails outright
    // with ENETUNREACH, not a timeout. Resolving to a literal IPv4 address ourselves and
    // connecting directly to it sidesteps nodemailer's own dual-stack selection entirely.
    // `tls.servername` keeps certificate validation correct against the real hostname, since
    // Gmail's cert is issued for the name, not the IP. Resolved once at startup rather than
    // per-send — acceptable for a single long-lived Gmail relay; if Gmail ever rotates this
    // IP mid-deployment, a redeploy re-resolves it.
    let connectHost = host;
    try {
      const addresses = await resolve4(host);
      if (addresses.length > 0) connectHost = addresses[0];
    } catch (err) {
      this.logger.warn(`Could not resolve an IPv4 address for ${host}, falling back to hostname: ${String(err)}`);
    }

    this.transporter = createTransport({
      host: connectHost,
      port: this.configService.get<number>('SMTP_PORT') ?? 587,
      secure: false,
      auth: { user, pass: password },
      tls: { servername: host },
      // Nodemailer's own defaults (minutes-long) turn a blocked/throttled outbound SMTP
      // connection into a near-infinite hang — observed for real on Railway, where Gmail
      // silently drops the connection attempt instead of refusing it outright. Bounding
      // every attempt to single-digit seconds caps the damage app-wide (login, forgot-password,
      // every M&E notification) regardless of whether the underlying network issue is fixed.
      connectionTimeout: 8_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
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
