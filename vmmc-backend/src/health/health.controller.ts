import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  check() {
    return { status: 'ok' };
  }

  /** Confirms DB connectivity (and, incidentally, that Phase 1's seed landed) — also doubles as the Phase 12 readiness probe. */
  @Get('ready')
  async ready() {
    const { count, error } = await this.supabase
      .getClient()
      .from('departments')
      .select('*', { count: 'exact', head: true });

    if (error) throw new ServiceUnavailableException(error.message);
    return { status: 'ready', departments: count };
  }
}
