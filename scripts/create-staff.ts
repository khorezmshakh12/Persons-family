/**
 * Bootstraps a staff account directly via the Supabase admin API. This is how
 * the very first CEO account gets created (before any admin UI exists to do
 * it) and doubles as a manual tool until Step 6's Staff Management UI lands.
 *
 * Usage:
 *   npx tsx scripts/create-staff.ts --phone +998901234567 --first-name Aziz \
 *     --last-name Karimov --dob 1990-01-01 --role ceo
 *
 * Prints a one-time temporary password — share it with the staff member
 * out of band. They'll be forced to set a permanent password on first login.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizePhone, phoneToSyntheticEmail } from '../src/lib/auth/phone';

type Role = 'ceo' | 'admin_manager' | 'teacher' | 'assistant';
const VALID_ROLES: Role[] = ['ceo', 'admin_manager', 'teacher', 'assistant'];

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) {
      args[key.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function generateTempPassword() {
  return randomBytes(9).toString('base64url');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { phone: rawPhone, 'first-name': firstName, 'last-name': lastName, dob, role } = args;

  if (!rawPhone || !firstName || !lastName || !dob || !role) {
    console.error(
      'Usage: npx tsx scripts/create-staff.ts --phone <phone> --first-name <name> --last-name <name> --dob <YYYY-MM-DD> --role <ceo|admin_manager|teacher|assistant>',
    );
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role as Role)) {
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    console.error(`Invalid phone "${rawPhone}". Expected a 9-digit Uzbek number, with or without +998.`);
    process.exit(1);
  }

  const email = phoneToSyntheticEmail(phone);
  const tempPassword = generateTempPassword();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error('Failed to create auth user:', createError?.message);
    process.exit(1);
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    phone,
    first_name: firstName,
    last_name: lastName,
    date_of_birth: dob,
    role: role as Role,
  });

  if (profileError) {
    console.error('Failed to create profile row:', profileError.message);
    await admin.auth.admin.deleteUser(created.user.id);
    process.exit(1);
  }

  console.log('Staff account created.');
  console.log(`  Phone:            ${phone}`);
  console.log(`  Role:             ${role}`);
  console.log(`  Temp password:    ${tempPassword}`);
  console.log('Share the phone + temp password with the staff member. They must set a new password on first login.');
}

main();
