import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import type { EmployeeContext } from '../auth/types/role';
import { ComplianceRecordService } from '../compliance/compliance-record.service';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { DocumentsService } from '../documents/documents.service';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { UploadSignatureDto } from '../signatures/dto/upload-signature.dto';
import { SignaturesService } from '../signatures/signatures.service';
import { ActivityService } from './activity.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DevicesService } from './devices.service';
import { ProfileService } from './profile.service';
import { SecurityService } from './security.service';

@ApiTags('me')
@ApiBearerAuth('access-token')
@Controller('me')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class MeController {
  constructor(
    private readonly complianceRecordService: ComplianceRecordService,
    private readonly documentsService: DocumentsService,
    private readonly signaturesService: SignaturesService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
    private readonly profileService: ProfileService,
    private readonly securityService: SecurityService,
    private readonly devicesService: DevicesService,
    private readonly activityService: ActivityService,
  ) {}

  @Get('profile')
  getProfile(@CurrentUser() employee: EmployeeContext) {
    return employee;
  }

  @Patch('profile')
  @Idempotent()
  updateProfile(@CurrentUser() employee: EmployeeContext, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(employee, dto);
  }

  @Get('compliance-summary')
  getComplianceSummary(@CurrentUser() employee: EmployeeContext) {
    return this.complianceRecordService.getDossier(employee, employee.id);
  }

  @Get('documents')
  getMyDocuments(@CurrentUser() employee: EmployeeContext) {
    return this.documentsService.listMine(employee);
  }

  @Get('notifications')
  getMyNotifications(@CurrentUser() employee: EmployeeContext) {
    return this.notificationDispatcherService.listMine(employee.id);
  }

  @Get('signature')
  @Roles('ADMIN')
  getSignature(@CurrentUser() employee: EmployeeContext) {
    return this.signaturesService.getActive(employee);
  }

  @Post('signature')
  @Roles('ADMIN')
  uploadSignature(@CurrentUser() employee: EmployeeContext, @Body() dto: UploadSignatureDto) {
    return this.signaturesService.upload(employee, dto.imageDataUrl);
  }

  @Delete('signature')
  @Roles('ADMIN')
  deleteSignature(@CurrentUser() employee: EmployeeContext) {
    return this.signaturesService.deactivate(employee);
  }

  @Patch('security/pin')
  updatePin(@CurrentUser() employee: EmployeeContext, @Body() dto: UpdatePinDto) {
    return this.securityService.updatePin(employee, dto.currentPin, dto.newPin);
  }

  @Patch('security/password')
  updatePassword(@CurrentUser() employee: EmployeeContext, @Body() dto: UpdatePasswordDto) {
    return this.securityService.updatePassword(employee, dto.currentPassword, dto.newPassword);
  }

  @Get('privacy-settings')
  getPrivacySettings(@CurrentUser() employee: EmployeeContext) {
    return this.profileService.getPrivacySettings(employee);
  }

  @Get('performance-stats')
  @Roles('ADMIN')
  getPerformanceStats(@CurrentUser() employee: EmployeeContext) {
    return this.profileService.getPerformanceStats(employee);
  }

  @Patch('privacy-settings')
  updatePrivacySettings(@CurrentUser() employee: EmployeeContext, @Body() dto: UpdatePrivacySettingsDto) {
    return this.profileService.updatePrivacySettings(employee, dto);
  }

  @Get('activity-logs')
  getActivityLogs(@CurrentUser() employee: EmployeeContext) {
    return this.activityService.listActivityLogs(employee);
  }

  @Get('login-history')
  getLoginHistory(@CurrentUser() employee: EmployeeContext) {
    return this.activityService.listLoginHistory(employee);
  }

  @Get('devices')
  listDevices(@CurrentUser() employee: EmployeeContext) {
    return this.devicesService.list(employee);
  }

  @Post('devices')
  @Idempotent()
  registerDevice(@CurrentUser() employee: EmployeeContext, @Body() dto: CreateDeviceDto) {
    return this.devicesService.register(employee, dto);
  }

  @Delete('devices/:id')
  removeDevice(@CurrentUser() employee: EmployeeContext, @Param('id') id: string) {
    return this.devicesService.remove(employee, id);
  }
}
