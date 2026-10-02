import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { detectFileType } from '../documents/file-type';
import { SupabaseService } from '../supabase/supabase.service';
import { EmployeeContext } from '../auth/types/role';

const BUCKET = 'signatures';
const MAX_SIZE_BYTES = 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600;

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl.trim());
  if (!match) throw new BadRequestException('imageDataUrl must be a base64 PNG data URL.');
  return Buffer.from(match[1], 'base64');
}

@Injectable()
export class SignaturesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async upload(admin: EmployeeContext, imageDataUrl: string) {
    const buffer = decodeDataUrl(imageDataUrl);
    if (buffer.length === 0) throw new BadRequestException('Signature image is empty.');
    if (buffer.length > MAX_SIZE_BYTES) throw new BadRequestException('Signature image exceeds the 1MB limit.');
    if (detectFileType(buffer) !== 'png') throw new BadRequestException('Signature image must be a PNG.');

    const client = this.supabaseService.getClient();

    await client.from('digital_signatures').update({ is_active: false }).eq('admin_id', admin.id).eq('is_active', true);

    const storagePath = `${admin.id}/${randomUUID()}.png`;
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: 'image/png', upsert: false });
    if (uploadError) throw new BadRequestException(uploadError.message);

    const { data, error } = await client
      .from('digital_signatures')
      .insert({ admin_id: admin.id, signature_path: storagePath, is_active: true })
      .select('id, signature_path, created_at')
      .single();
    if (error) throw new BadRequestException(error.message);

    return this.toResponse(data);
  }

  async getActive(admin: EmployeeContext) {
    const { data } = await this.supabaseService
      .getClient()
      .from('digital_signatures')
      .select('id, signature_path, created_at')
      .eq('admin_id', admin.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) return null;
    return this.toResponse(data);
  }

  async deactivate(admin: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('digital_signatures')
      .update({ is_active: false })
      .eq('admin_id', admin.id)
      .eq('is_active', true)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('No active signature to delete.');
    return { message: 'Signature deleted.' };
  }

  /** Used by the review flow to confirm a signatureId genuinely belongs to the approving admin. */
  async assertOwnedByAdmin(signatureId: string, adminId: string) {
    const { data } = await this.supabaseService
      .getClient()
      .from('digital_signatures')
      .select('id')
      .eq('id', signatureId)
      .eq('admin_id', adminId)
      .maybeSingle();
    if (!data) throw new BadRequestException('Signature not found for this admin.');
  }

  private async toResponse(row: { id: string; signature_path: string; created_at: string }) {
    const { data: signed } = await this.supabaseService
      .getClient()
      .storage.from(BUCKET)
      .createSignedUrl(row.signature_path, SIGNED_URL_TTL_SECONDS);
    return { id: row.id, imageUrl: signed?.signedUrl ?? null, createdAt: row.created_at };
  }
}
