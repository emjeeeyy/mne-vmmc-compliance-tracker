import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SecurityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async updatePin(currentUser: EmployeeContext, currentPin: string | undefined, newPin: string) {
    const client = this.supabaseService.getClient();
    const { data: employee } = await client.from('employees').select('pin_hash').eq('id', currentUser.id).single();

    if (employee?.pin_hash) {
      if (!currentPin) throw new BadRequestException('Current PIN is required.');
      const matches = await bcrypt.compare(currentPin, employee.pin_hash);
      if (!matches) throw new UnauthorizedException('Current PIN is incorrect.');
    }

    const newHash = await bcrypt.hash(newPin, 10);
    const { error } = await client.from('employees').update({ pin_hash: newHash }).eq('id', currentUser.id);
    if (error) throw new BadRequestException(error.message);
    return { message: 'PIN updated.' };
  }

  async updatePassword(currentUser: EmployeeContext, currentPassword: string, newPassword: string) {
    const client = this.supabaseService.getClient();

    const { error: verifyError } = await this.supabaseService.getAnonClient().auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (verifyError) throw new UnauthorizedException('Current password is incorrect.');

    const { error } = await client.auth.admin.updateUserById(currentUser.authUserId, { password: newPassword });
    if (error) throw new BadRequestException(error.message);
    return { message: 'Password updated.' };
  }
}
