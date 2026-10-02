import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async updateProfile(currentUser: EmployeeContext, dto: UpdateProfileDto) {
    const patch = {
      ...(dto.fullName !== undefined && { full_name: dto.fullName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
    };
    if (Object.keys(patch).length === 0) return { message: 'Nothing to update.' };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('employees')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', currentUser.id)
      .select('id, employee_id, full_name, job_title, email, phone, role, department_id')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Depends on the `employees.privacy_settings` column added in the Phase 10 migration. */
  async getPrivacySettings(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('employees')
      .select('privacy_settings')
      .eq('id', currentUser.id)
      .single();
    if (error) throw new BadRequestException(error.message);
    return data.privacy_settings ?? {};
  }

  async updatePrivacySettings(currentUser: EmployeeContext, dto: UpdatePrivacySettingsDto) {
    const current = await this.getPrivacySettings(currentUser);
    const merged = { ...current, ...dto };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('employees')
      .update({ privacy_settings: merged })
      .eq('id', currentUser.id)
      .select('privacy_settings')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data.privacy_settings;
  }

  /** Admin "Performance Overview" card — all-time counts of this admin's own review activity.
   * `approvalRate` replaces the old mock's "Uptime" stat: a system-availability metric never
   * had anything to do with one admin's personal performance, and this app has no real uptime
   * tracking to source it from anyway; approval rate is a real, derivable number that actually
   * belongs in a per-admin performance summary. */
  async getPerformanceStats(currentUser: EmployeeContext) {
    const client = this.supabaseService.getClient();

    const { count: reviews, error: reviewsError } = await client
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed_by', currentUser.id);
    if (reviewsError) throw new BadRequestException(reviewsError.message);

    const { count: approvals, error: approvalsError } = await client
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed_by', currentUser.id)
      .eq('review_status', 'APPROVED');
    if (approvalsError) throw new BadRequestException(approvalsError.message);

    const reviewCount = reviews ?? 0;
    const approvalCount = approvals ?? 0;
    return {
      reviews: reviewCount,
      approvals: approvalCount,
      approvalRate: reviewCount > 0 ? Math.round((approvalCount / reviewCount) * 100) : 0,
    };
  }
}
