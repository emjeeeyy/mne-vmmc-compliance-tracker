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
const password = process.env.SEED_DEMO_PASSWORD;

if (!url || !serviceRoleKey || !password) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SEED_DEMO_PASSWORD in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, employee_id, email, auth_user_id')
    .is('auth_user_id', null);
  if (error) throw error;

  if (!employees || employees.length === 0) {
    console.log('All seeded employees already have auth accounts.');
    return;
  }

  for (const employee of employees) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: employee.email,
      password,
      email_confirm: true,
      user_metadata: { employee_id: employee.employee_id },
    });
    if (createError) {
      console.error(`Failed to create auth user for ${employee.employee_id} (${employee.email}): ${createError.message}`);
      continue;
    }

    const { error: linkError } = await supabase
      .from('employees')
      .update({ auth_user_id: created.user.id })
      .eq('id', employee.id);
    if (linkError) {
      console.error(`Created auth user but failed to link ${employee.employee_id}: ${linkError.message}`);
      continue;
    }

    console.log(`Linked ${employee.employee_id} (${employee.email}) -> auth user ${created.user.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
