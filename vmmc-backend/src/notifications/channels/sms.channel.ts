import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages';
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

export interface ChannelResult {
  status: 'SENT' | 'FAILED' | 'LOGGED';
  providerRef: string | null;
  retryCount: number;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends via Semaphore (PH-focused SMS gateway) when SEMAPHORE_API_KEY is configured;
 * otherwise logs what would have been sent so the flow is demoable at zero cost.
 */
@Injectable()
export class SmsChannel {
  private readonly logger = new Logger(SmsChannel.name);

  constructor(private readonly configService: ConfigService) {}

  async send(phone: string, message: string): Promise<ChannelResult> {
    const apiKey = this.configService.get<string>('SEMAPHORE_API_KEY');
    if (!apiKey) {
      this.logger.log(`[DEV SMS] to ${phone}: ${message}`);
      return { status: 'LOGGED', providerRef: null, retryCount: 0 };
    }

    const senderName = this.configService.get<string>('SEMAPHORE_SENDER_NAME');
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
      try {
        const res = await fetch(SEMAPHORE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apikey: apiKey,
            number: phone,
            message,
            ...(senderName ? { sendername: senderName } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Semaphore responded ${res.status}`);
        const data = (await res.json()) as Array<{ message_id?: number }>;
        return { status: 'SENT', providerRef: data[0]?.message_id?.toString() ?? null, retryCount: attempt };
      } catch (err) {
        lastError = err;
      }
    }

    this.logger.error(`SMS to ${phone} failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
    return { status: 'FAILED', providerRef: null, retryCount: MAX_ATTEMPTS };
  }
}
