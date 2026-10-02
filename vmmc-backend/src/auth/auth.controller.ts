import { Body, Controller, Headers, HttpCode, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { FirstLoginPasswordChangeDto } from './dto/first-login-password-change.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request) {
    return this.authService.login(dto.employeeId, dto.password, dto.portal, {
      ipAddress: ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post('signup')
  @HttpCode(200)
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto.employeeId, dto.employmentType);
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
  logout(@Headers('authorization') authorization: string) {
    return this.authService.logout(authorization.slice('Bearer '.length));
  }
}
