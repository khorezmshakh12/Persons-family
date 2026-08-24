/**
 * Bootstraps a staff account directly via Identity Platform + Cloud SQL. This
 * is how the very first CEO account gets created (before any admin UI exists
 * to do it) and doubles as a manual tool for one-off account creation outside
 * the normal Staff Management UI.
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
import { randomBytes, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import postgres from 'postgres';
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

  const projectId = process.env.GCP_PROJECT_ID!;
  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
    serviceAccountId: `app-runtime@${projectId}.iam.gserviceaccount.com`,
  });
  const auth = getAuth(app);
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

  let uid: string;
  try {
    // profiles.id is a uuid column, but an auto-generated Identity Platform
    // uid isn't UUID-shaped — the insert below would fail with "invalid
    // input syntax for type uuid" otherwise (see the identical fix in
    // src/lib/actions/staff.ts's createStaffRow).
    const user = await auth.createUser({ uid: randomUUID(), email, password: tempPassword, emailVerified: true });
    await auth.setCustomUserClaims(user.uid, { role, mustChangePassword: true });
    uid = user.uid;
  } catch (error) {
    console.error('Failed to create Identity Platform user:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  try {
    await sql`
      insert into profiles (id, phone, first_name, last_name, date_of_birth, role)
      values (${uid}, ${phone}, ${firstName}, ${lastName}, ${dob}, ${role})
    `;
  } catch (error) {
    console.error('Failed to create profile row:', error instanceof Error ? error.message : error);
    await auth.deleteUser(uid);
    process.exit(1);
  } finally {
    await sql.end();
  }

  console.log('Staff account created.');
  console.log(`  Phone:            ${phone}`);
  console.log(`  Role:             ${role}`);
  console.log(`  Temp password:    ${tempPassword}`);
  console.log('Share the phone + temp password with the staff member. They must set a new password on first login.');
}

main();
