import { Body, Controller, Headers, HttpCode, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { FirstLoginPasswordChangeDto } from './dto/first-login-password-change.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto.employeeId, dto.password, dto.portal, {
      ipAddress: ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    if (!('mfaRequired' in session)) {
      this.setSessionCookie(res, session.accessToken, session.expiresAt);
    }
    return session;
  }

  @Post('verify-login-otp')
  @HttpCode(200)
  async verifyLoginOtp(
    @Body() dto: VerifyLoginOtpDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.verifyLoginOtp(dto.employeeId, dto.portal, dto.otp, {
      ipAddress: ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.setSessionCookie(res, session.accessToken, session.expiresAt);
    return session;
  }

  @Post('signup')
  @HttpCode(200)
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto.email, dto.employmentType, dto.privacyAcknowledged);
  }

  @Post('first-login/change-password')
  @HttpCode(200)
  firstLoginChangePassword(@Body() dto: FirstLoginPasswordChangeDto) {
    return this.authService.completeFirstLoginPasswordChange(dto.employeeId, dto.currentPassword, dto.newPassword);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.contact);
  }

  @Post('verify-otp')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.contact, dto.otp);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @UseGuards(SupabaseAuthGuard)
  logout(
    @Req() req: Request,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : this.extractTokenFromCookie(req.headers.cookie);
    if (token) {
      this.authService.logout(token);
    }
    res.clearCookie('vmmc_session', { path: '/', httpOnly: true, sameSite: 'lax' });
    return { ok: true };
  }

  private setSessionCookie(res: Response, accessToken: string, expiresAt?: number) {
    const expiresAtMs = Number(expiresAt ?? 0);
    const lifetimeMs = expiresAtMs > 0 ? Math.max(0, expiresAtMs * 1000 - Date.now()) : 60 * 60 * 1000;
    res.cookie('vmmc_session', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: lifetimeMs,
    });
  }

  private extractTokenFromCookie(cookieHeader?: string): string | null {
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'vmmc_session') {
        return decodeURIComponent(rest.join('=')).trim() || null;
      }
    }

    return null;
  }
}
