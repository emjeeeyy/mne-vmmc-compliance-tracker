import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('departments')
      .select('id, name, code, unit_head_id, created_at')
      .order('name');
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
