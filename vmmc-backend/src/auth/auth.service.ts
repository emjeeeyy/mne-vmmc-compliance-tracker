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
import { validateEmployeeId } from '../common/assert-access';
import { describeUserAgent } from '../common/describe-user-agent';
import { EmailChannel } from '../notifications/channels/email.channel';
import { buildLoginOtpEmail } from '../notifications/email-templates/login-otp.template';
import { buildOtpEmail } from '../notifications/email-templates/otp.template';
import { SupabaseService } from '../supabase/supabase.service';
import { Role } from './types/role';

const OTP_TTL_MINUTES = 10;
const LOGIN_OTP_TTL_MINUTES = 10;
const LOGIN_OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL = '5m';
const RESET_TOKEN_PURPOSE = 'password_reset';
const DEFAULT_PASSWORD = 'password123';

interface EmployeeRow {
  id: string;
  auth_user_id: string | null;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  email: string;
  phone: string | null;
  role: Role;
  department_id: string;
  must_change_password?: boolean;
  two_factor_enabled?: boolean;
}

/** The two values out of a Supabase session that finishLogin() actually needs to hand back —
 * shaped so the same method works whether the session was just minted by signInWithPassword()
 * (plain login) or read back out of a login_otps row (post-2FA). */
interface SessionLike {
  access_token: string;
  expires_at?: number;
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
    if (!employee) {
      await this.logLoginFailure(null, context, { employeeId, reason: 'employee_not_found' });
      throw new UnauthorizedException('Invalid Employee ID or password.');
    }

    const { data, error } = await this.supabaseService.getAnonClient().auth.signInWithPassword({
      email: employee.email,
      password,
    });
    if (error || !data.session) {
      await this.logLoginFailure(employee.id, context, { employeeId, reason: 'invalid_credentials' });
      throw new UnauthorizedException('Invalid Employee ID or password.');
    }

    if (!PORTAL_ROLES[portal].includes(employee.role)) {
      await this.logLoginFailure(employee.id, context, { employeeId, reason: 'wrong_portal', portal });
      throw new ForbiddenException('This account is not authorized for the selected portal.');
    }

    if (employee.two_factor_enabled) {
      await this.issueLoginOtp(employee, data.session);
      return { mfaRequired: true as const, employeeId: employee.employee_id, portal };
    }

    return this.finishLogin(employee, data.session, context);
  }

  /** The last step both the plain-password path and the post-2FA path converge on — audits the
   * LOGIN, records the device, and shapes the real session response. Deliberately not reached at
   * all until 2FA (if enabled) has actually been satisfied — logging LOGIN/recording a device for
   * a password-only attempt would be premature for an account that still needs a second factor. */
  private async finishLogin(employee: EmployeeRow, session: SessionLike, context: { ipAddress: string | null; userAgent: string | null }) {
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
      accessToken: session.access_token,
      expiresAt: session.expires_at,
      user: this.toPublicUser(employee),
      mustChangePassword: Boolean(employee.must_change_password),
    };
  }

  /** Stashes the session signInWithPassword() already minted — there's no password to re-check in
   * verifyLoginOtp(), only employeeId/portal/otp, so this is the only place a session can come
   * from once the OTP step starts. See the migration's comment on login_otps for the full reasoning. */
  private async issueLoginOtp(employee: EmployeeRow, session: SessionLike) {
    // session.expires_at is typed optional by the Supabase SDK, but a session that just came
    // straight out of a successful signInWithPassword() always has one in practice — guarded
    // explicitly so a missing value fails with a clear message here, not an opaque NOT NULL
    // constraint violation from the insert below.
    if (!session.expires_at) throw new BadRequestException('Unable to start the login verification step.');

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60_000).toISOString();

    const { error } = await this.supabaseService.getClient().from('login_otps').insert({
      employee_id: employee.id,
      otp_hash: otpHash,
      expires_at: expiresAt,
      access_token: session.access_token,
      token_expires_at: session.expires_at,
    });
    if (error) throw new BadRequestException(error.message);

    const otpEmail = buildLoginOtpEmail({
      name: employee.full_name,
      code: otp,
      expiresMinutes: LOGIN_OTP_TTL_MINUTES,
      requestedAt: new Date(),
    });
    // Deliberately not awaited: the code is already stored and checkable the moment this
    // returns, and send() can never reject (it catches its own retries) — but a slow/stuck
    // SMTP connection must never hold the login request itself hostage. See email.channel.ts.
    void this.emailChannel.send(employee.email, otpEmail.subject, otpEmail.text, otpEmail.html);
  }

  async verifyLoginOtp(
    employeeId: string,
    portal: 'staff' | 'admin',
    otp: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    const employee = await this.findEmployeeByEmployeeId(employeeId);
    if (!employee) throw new UnauthorizedException('Invalid Employee ID or code.');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('login_otps')
      .select('id, otp_hash, expires_at, consumed_at, attempt_count, access_token, token_expires_at')
      .eq('employee_id', employee.id)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new BadRequestException('Invalid or expired code.');

    if (new Date(data.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired code.');
    }

    // Checked before the hash compare, not after — a locked-out attempt shouldn't still get a
    // real pass/fail verdict on whatever code they just typed.
    if (data.attempt_count >= LOGIN_OTP_MAX_ATTEMPTS) {
      await this.logLoginFailure(employee.id, context, { employeeId, reason: 'login_otp_locked' });
      throw new BadRequestException('Too many incorrect attempts. Please log in again to request a new code.');
    }

    const matches = await bcrypt.compare(otp, data.otp_hash);
    if (!matches) {
      await this.supabaseService
        .getClient()
        .from('login_otps')
        .update({ attempt_count: data.attempt_count + 1 })
        .eq('id', data.id);
      await this.logLoginFailure(employee.id, context, { employeeId, reason: 'invalid_login_otp' });
      throw new BadRequestException('Invalid or expired code.');
    }

    if (!PORTAL_ROLES[portal].includes(employee.role)) {
      throw new ForbiddenException('This account is not authorized for the selected portal.');
    }

    await this.supabaseService
      .getClient()
      .from('login_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', data.id);

    return this.finishLogin(employee, { access_token: data.access_token, expires_at: data.token_expires_at }, context);
  }

  async signup(employeeId: string, employmentType?: 'PERMANENT' | 'COS') {
    const normalizedId = validateEmployeeId(employeeId, employmentType).toUpperCase();
    const employee = await this.findEmployeeByEmployeeId(normalizedId);
    if (!employee) throw new BadRequestException('No employee matches that ID. Please contact HR.');
    if (employee.auth_user_id) throw new BadRequestException('This employee already has an account.');

    const { data: created, error: createError } = await this.supabaseService.getClient().auth.admin.createUser({
      email: employee.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { employee_id: employee.employee_id },
    });
    if (createError || !created?.user) throw new BadRequestException(createError?.message ?? 'Unable to create the account.');

    const { error: linkError } = await this.supabaseService
      .getClient()
      .from('employees')
      .update({ auth_user_id: created.user.id, must_change_password: true })
      .eq('id', employee.id);
    if (linkError) throw new BadRequestException(linkError.message);

    return {
      message: 'Account created. Use the default password password123 to sign in. You will be required to change it on first login.',
    };
  }

  async completeFirstLoginPasswordChange(employeeId: string, currentPassword: string, newPassword: string) {
    const employee = await this.findEmployeeByEmployeeId(employeeId);
    if (!employee) throw new UnauthorizedException('Invalid Employee ID or password.');
    if (!employee.must_change_password) {
      throw new BadRequestException('This account does not require a password change.');
    }

    const { error } = await this.supabaseService.getAnonClient().auth.signInWithPassword({
      email: employee.email,
      password: currentPassword,
    });
    if (error) throw new UnauthorizedException('Current password is incorrect.');

    const { error: updateError } = await this.supabaseService.getClient().auth.admin.updateUserById(employee.auth_user_id!, {
      password: newPassword,
    });
    if (updateError) throw new BadRequestException(updateError.message);

    const { error: markError } = await this.supabaseService
      .getClient()
      .from('employees')
      .update({ must_change_password: false })
      .eq('id', employee.id);
    if (markError) throw new BadRequestException(markError.message);

    return { message: 'Password updated. You can now sign in with your new password.' };
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
    const otpEmail = buildOtpEmail({
      name: employee.full_name,
      code: otp,
      expiresMinutes: OTP_TTL_MINUTES,
      requestedAt: new Date(),
    });
    // Same reasoning as issueLoginOtp(): don't let a slow/stuck SMTP connection hold this
    // request hostage — the response below doesn't depend on the email having actually sent yet.
    void this.emailChannel.send(employee.email, otpEmail.subject, otpEmail.text, otpEmail.html);

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

  /** `actorId` is null when the employee ID itself didn't resolve to anyone — there's no one
   * to attribute the attempt to, but the attempted ID/reason are still recorded in `after` so
   * the raw audit trail captures it even though it can never surface in that employee's own
   * Activity Logs (ActivityService.listActivityLogs filters by actor_id). */
  private async logLoginFailure(
    actorId: string | null,
    context: { ipAddress: string | null; userAgent: string | null },
    details: Record<string, unknown>,
  ) {
    await this.auditService.log({
      actorId,
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      entityId: actorId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      after: details,
    });
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
      .select('id, auth_user_id, employee_id, full_name, job_title, email, phone, role, department_id, must_change_password, two_factor_enabled')
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
