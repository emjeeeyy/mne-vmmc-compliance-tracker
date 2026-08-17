import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const path = resolve(__dirname, '..', '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKETS = [
  { name: 'documents', fileSizeLimit: '5MB', allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'] },
  { name: 'signatures', fileSizeLimit: '1MB', allowedMimeTypes: ['image/png'] },
];

async function main() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  const existing = new Set((buckets ?? []).map((b) => b.name));

  for (const bucket of BUCKETS) {
    if (existing.has(bucket.name)) {
      console.log(`Bucket "${bucket.name}" already exists.`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
    });
    if (error) throw error;
    console.log(`Created private bucket "${bucket.name}" (${bucket.fileSizeLimit} limit, ${bucket.allowedMimeTypes.join('/')}).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
