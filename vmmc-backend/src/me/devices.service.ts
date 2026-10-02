import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateDeviceDto } from './dto/create-device.dto';

interface DeviceRow {
  id: string;
  name: string;
  device_type: string | null;
  last_active: string | null;
  location: string | null;
  is_current: boolean;
  trusted: boolean;
  created_at: string;
}

function toPublicDevice(row: DeviceRow) {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.device_type,
    lastActive: row.last_active,
    location: row.location,
    isCurrent: row.is_current,
    trusted: row.trusted,
  };
}

@Injectable()
export class DevicesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('devices')
      .select('id, name, device_type, last_active, location, is_current, trusted, created_at')
      .eq('employee_id', currentUser.id)
      .order('last_active', { ascending: false, nullsFirst: false })
      .returns<DeviceRow[]>();
    if (error) throw error;
    return (data ?? []).map(toPublicDevice);
  }

  async register(currentUser: EmployeeContext, dto: CreateDeviceDto) {
    const client = this.supabaseService.getClient();
    // The device registering itself is, by definition, the current one.
    await client.from('devices').update({ is_current: false }).eq('employee_id', currentUser.id);

    const { data, error } = await client
      .from('devices')
      .insert({
        employee_id: currentUser.id,
        name: dto.name,
        device_type: dto.deviceType ?? null,
        last_active: new Date().toISOString(),
        is_current: true,
        trusted: true,
      })
      .select()
      .single<DeviceRow>();
    if (error) throw error;
    return toPublicDevice(data);
  }

  async remove(currentUser: EmployeeContext, id: string) {
    const client = this.supabaseService.getClient();
    const { data: device } = await client.from('devices').select('id, employee_id').eq('id', id).maybeSingle();
    if (!device) throw new NotFoundException('Device not found.');
    if (device.employee_id !== currentUser.id) throw new ForbiddenException('You do not own this device.');

    const { error } = await client.from('devices').delete().eq('id', id);
    if (error) throw error;
    return { message: 'Device removed.' };
  }
}
