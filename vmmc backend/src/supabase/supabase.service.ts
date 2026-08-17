import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  private readonly url: string;
  private readonly anonKey: string;

  constructor(configService: ConfigService) {
    this.url = configService.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = configService.getOrThrow<string>('SUPABASE_ANON_KEY');

    this.client = createClient(this.url, configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Service-role client — bypasses RLS. Only for use inside the backend, never forwarded to clients. */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Anon-key client for the password-grant sign-in call. Deliberately constructed fresh on every
   * call rather than cached as a singleton: GoTrueClient's internal auth lock is built for a
   * single browser tab, not dozens of concurrent server-side signInWithPassword calls sharing one
   * instance — under real concurrency (see Phase 11 stress test) a shared instance produced
   * spurious 401s for otherwise-correct credentials. `createClient()` does no I/O, so this is cheap.
   */
  getAnonClient(): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}
