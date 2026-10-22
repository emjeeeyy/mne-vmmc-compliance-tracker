import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RegistryService } from './registry.service';

@ApiTags('registry')
@ApiBearerAuth('access-token')
@Controller('registry')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  @Get('ape')
  getApe() {
    return this.registryService.getApe();
  }

  @Get('pre-employment')
  getPreEmployment() {
    return this.registryService.getPreEmployment();
  }

  @Get('pep')
  getPep() {
    return this.registryService.getPep();
  }

  @Get('immunizations')
  getImmunizations() {
    return this.registryService.getImmunizations();
  }

  @Get('certificate/:employeeId')
  getClearanceCertificate(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.registryService.getClearanceCertificate(employeeId);
  }
}
