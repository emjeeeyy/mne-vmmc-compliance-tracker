import { randomInt } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { describeUserAgent } from '../common/describe-user-agent';
import { EmailChannel } from '../notifications/channels/email.channel';
import { SupabaseService } from '../supabase/supabase.service';
import { Role } from './types/role';

const OTP_TTL_MINUTES = 10;
const RESET_TOKEN_TTL = '5m';
const RESET_TOKEN_PURPOSE = 'password_reset';

interface EmployeeRow {
  id: string;
  auth_user_id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  email: string;
  phone: string | null;
  role: Role;
  department_id: string;
}

const PORTAL_ROLES: Record<'staff' | 'admin', Role[]> = {
  staff: ['STAFF', 'UNIT_HEAD'],
  admin: ['ADMIN'],
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly emailChannel: EmailChannel,
  ) {}

  async login(
    employeeId: string,
    password: string,
    portal: 'staff' | 'admin',
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    const employee = await this.findEmployeeByEmployeeId(employeeId);
    if (!employee) throw new UnauthorizedException('Invalid Employee ID or password.');

    const { data, error } = await this.supabaseService.getAnonClient().auth.signInWithPassword({
      email: employee.email,
      password,
    });
    if (error || !data.session) throw new UnauthorizedException('Invalid Employee ID or password.');

    if (!PORTAL_ROLES[portal].includes(employee.role)) {
      throw new ForbiddenException('This account is not authorized for the selected portal.');
    }

    await this.auditService.log({
      actorId: employee.id,
      action: 'LOGIN',
      entityType: 'auth',
      entityId: employee.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    await this.recordDeviceLogin(employee.id, context.userAgent);

    return {
      accessToken: data.session.access_token,
      expiresAt: data.session.expires_at,
      user: this.toPublicUser(employee),
    };
  }

  async forgotPassword(contact: string) {
    const employee = await this.findEmployeeByContact(contact);

    // Always return the same generic response — don't reveal whether the contact matched an account.
    if (!employee) return { message: 'If that account exists, a code has been sent.' };

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

    const { error } = await this.supabaseService
      .getClient()
      .from('password_reset_otps')
      .insert({ employee_id: employee.id, otp_hash: otpHash, expires_at: expiresAt });
    if (error) throw new BadRequestException(error.message);

    // EmailChannel itself falls back to logging (`[DEV EMAIL] ...`) when SMTP_USER/SMTP_PASSWORD
    // aren't configured, so this is safe to call unconditionally in every environment.
    await this.emailChannel.send(
      employee.email,
      'VMMC TB DOTS — Password reset code',
      `Your password reset code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.`,
    );

    return { message: 'If that account exists, a code has been sent.' };
  }

  async verifyOtp(contact: string, otp: string) {
    const employee = await this.findEmployeeByContact(contact);
    if (!employee) throw new BadRequestException('Invalid or expired code.');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('password_reset_otps')
      .select('id, otp_hash, expires_at, consumed_at')
      .eq('employee_id', employee.id)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new BadRequestException('Invalid or expired code.');

    if (new Date(data.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired code.');
    }
    const matches = await bcrypt.compare(otp, data.otp_hash);
    if (!matches) throw new BadRequestException('Invalid or expired code.');

    await this.supabaseService
      .getClient()
      .from('password_reset_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', data.id);

    const resetToken = await this.jwtService.signAsync(
      { sub: employee.id, purpose: RESET_TOKEN_PURPOSE },
      { secret: this.configService.getOrThrow<string>('RESET_TOKEN_SECRET'), expiresIn: RESET_TOKEN_TTL },
    );
    return { resetToken };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(resetToken, {
        secret: this.configService.getOrThrow<string>('RESET_TOKEN_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset session.');
    }
    if (payload.purpose !== RESET_TOKEN_PURPOSE) {
      throw new BadRequestException('Invalid or expired reset session.');
    }

    const { data: employee, error: findError } = await this.supabaseService
      .getClient()
      .from('employees')
      .select('id, auth_user_id')
      .eq('id', payload.sub)
      .single();
    if (findError || !employee) throw new BadRequestException('Invalid or expired reset session.');

    const { error } = await this.supabaseService.getClient().auth.admin.updateUserById(employee.auth_user_id, {
      password: newPassword,
    });
    if (error) throw new BadRequestException(error.message);

    return { message: 'Password updated.' };
  }

  async logout(accessToken: string) {
    try {
      await this.supabaseService.getClient().auth.admin.signOut(accessToken, 'global');
    } catch {
      // Token may already be expired/invalid — logout is best-effort either way.
    }
    return { message: 'Logged out.' };
  }

  /** Upserts a device row for Profile > Manage Devices, keyed on the browser+OS
   * signature (there's no real device fingerprinting, only a friendly name derived
   * from the user-agent) — matches the previous login's row by name if there is one,
   * otherwise creates a new row. Deliberately lives here rather than importing a
   * Devices module, since that module already needs AuthModule for its own guards
   * and this avoids a circular module dependency for ~10 lines of logic. */
  private async recordDeviceLogin(employeeId: string, userAgent: string | null) {
    const client = this.supabaseService.getClient();
    const name = describeUserAgent(userAgent);
    const now = new Date().toISOString();

    await client.from('devices').update({ is_current: false }).eq('employee_id', employeeId);

    const { data: existing } = await client
      .from('devices')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      await client.from('devices').update({ last_active: now, is_current: true }).eq('id', existing.id);
    } else {
      await client
        .from('devices')
        .insert({ employee_id: employeeId, name, device_type: null, last_active: now, is_current: true, trusted: true });
    }
  }

  private async findEmployeeByEmployeeId(employeeId: string): Promise<EmployeeRow | null> {
    const { data } = await this.supabaseService
      .getClient()
      .from('employees')
      .select('id, auth_user_id, employee_id, full_name, job_title, email, phone, role, department_id')
      .eq('employee_id', employeeId)
      .maybeSingle();
    return data as EmployeeRow | null;
  }

  private async findEmployeeByContact(contact: string): Promise<EmployeeRow | null> {
    const trimmed = contact.trim();
    const columns = 'id, auth_user_id, employee_id, full_name, job_title, email, phone, role, department_id';

    if (trimmed.includes('@')) {
      const { data } = await this.supabaseService
        .getClient()
        .from('employees')
        .select(columns)
        .eq('email', trimmed)
        .maybeSingle();
      return data as EmployeeRow | null;
    }

    // PH mobile numbers may be typed locally (09XXXXXXXXX) or stored internationally
    // (+639XXXXXXXX) — match on the last 10 significant digits either way.
    const last10 = trimmed.replace(/\D/g, '').slice(-10);
    const { data } = await this.supabaseService
      .getClient()
      .from('employees')
      .select(columns)
      .like('phone', `%${last10}`)
      .maybeSingle();
    return data as EmployeeRow | null;
  }

  private toPublicUser(employee: EmployeeRow) {
    return {
      id: employee.id,
      employeeId: employee.employee_id,
      fullName: employee.full_name,
      jobTitle: employee.job_title,
      email: employee.email,
      role: employee.role,
      departmentId: employee.department_id,
    };
  }
}
