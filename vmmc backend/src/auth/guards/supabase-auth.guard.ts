import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RequestWithEmployee } from '../types/request-with-employee';
import { EmployeeContext, Role } from '../types/role';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithEmployee>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token.');

    // Verifying via Supabase Auth itself (rather than decoding locally) works
    // regardless of whether the project signs tokens with the legacy shared
    // HS256 secret or the newer per-project asymmetric (ES256) signing keys.
    const {
      data: { user },
      error,
    } = await this.supabaseService.getClient().auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('Invalid or expired session.');

    const { data, error: employeeError } = await this.supabaseService
      .getClient()
      .from('employees')
      .select('id, auth_user_id, employee_id, full_name, job_title, email, role, department_id, birth_date')
      .eq('auth_user_id', user.id)
      .single();

    if (employeeError || !data) throw new UnauthorizedException('Account not found.');

    request.employee = {
      id: data.id,
      authUserId: data.auth_user_id,
      employeeId: data.employee_id,
      fullName: data.full_name,
      jobTitle: data.job_title,
      email: data.email,
      role: data.role as Role,
      departmentId: data.department_id,
      birthDate: data.birth_date,
    } satisfies EmployeeContext;

    return true;
  }

  private extractToken(request: RequestWithEmployee): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length);
  }
}
