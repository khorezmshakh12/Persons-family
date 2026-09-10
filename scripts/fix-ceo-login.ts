/**
 * Diagnose and repair a locked-out account (built for the CEO who couldn't
 * log back in after a phone-number edit went wrong, but works for any role).
 *
 * Login on this platform is: typed phone -> normalizePhone -> synthetic
 * email (phoneToSyntheticEmail) -> Identity Platform sign-in -> uid ->
 * `profiles` row by uid. So an account is only ever locked out when the
 * Identity Platform user's *email* no longer matches the number the person
 * types, when the account is `disabled` in Identity Platform, or when
 * `profiles.is_active` is false. `profiles.phone` itself is not on the
 * login path (only edit + display) — a stale value there doesn't lock
 * anyone out, it just misleads the next editor.
 *
 * DIAGNOSE (read-only, default):
 *   npx tsx scripts/fix-ceo-login.ts
 *   npx tsx scripts/fix-ceo-login.ts --role ceo
 *
 * REPAIR one account:
 *   npx tsx scripts/fix-ceo-login.ts --uid <profile-id> --phone +998901234567
 *   npx tsx scripts/fix-ceo-login.ts --uid <profile-id> --phone +998901234567 --reset-password
 *
 * --phone         the number the person will log in with from now on; both
 *                 the Identity Platform email and profiles.phone are set to
 *                 match it, the account is re-enabled (Identity `disabled`
 *                 off, profiles.is_active on, frozen_reason cleared), and
 *                 live sessions are revoked so the change takes effect now.
 * --reset-password  also set a fresh temporary password (printed once) and
 *                 flag must_change_password, so the person sets their own on
 *                 first login. Use this when the password is also unknown.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import postgres from 'postgres';
import { normalizePhone, phoneToSyntheticEmail } from '../src/lib/auth/phone';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[name] = next;
      i += 1;
    } else {
      args[name] = true;
    }
  }
  return args;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required (put it in .env.local or the environment).');
  process.exit(1);
}
const isLocal = /127\.0\.0\.1|localhost/.test(DATABASE_URL);
const sql = postgres(DATABASE_URL, { ssl: isLocal ? false : 'require', max: 1 });

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCP_PROJECT_ID,
  });
}
const auth = getAuth();

function tempPassword() {
  return randomBytes(9).toString('base64url');
}

async function diagnose(roleFilter?: string) {
  const rows = await sql<
    {
      id: string;
      phone: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
      must_change_password: boolean;
      frozen_reason: string | null;
    }[]
  >`
    select id, phone, first_name, last_name, role, is_active, must_change_password, frozen_reason
    from profiles
    ${roleFilter ? sql`where role = ${roleFilter}` : sql`where role in ('ceo', 'admin_manager')`}
    order by role, created_at asc
  `;

  if (rows.length === 0) {
    console.log('No matching profiles.');
    return;
  }

  for (const p of rows) {
    console.log('\n--------------------------------------------------------------');
    console.log(`${p.first_name} ${p.last_name}  (${p.role})`);
    console.log(`  profile id ........... ${p.id}`);
    console.log(`  profiles.phone ....... ${p.phone}`);
    console.log(`  is_active ............ ${p.is_active}${p.is_active ? '' : '   <-- LOCKED OUT (login rejects this)'}`);
    console.log(`  must_change_password . ${p.must_change_password}`);
    console.log(`  frozen_reason ........ ${p.frozen_reason ?? '(none)'}`);

    const expectedEmail = phoneToSyntheticEmail(p.phone);
    try {
      const user = await auth.getUser(p.id);
      const match = user.email === expectedEmail;
      console.log(`  identity email ....... ${user.email ?? '(none)'}`);
      console.log(`  identity disabled .... ${user.disabled}${user.disabled ? '   <-- LOCKED OUT' : ''}`);
      console.log(
        `  email matches phone .. ${match ? 'yes' : 'NO'}${
          match ? '' : `   <-- MISMATCH. Login expects "${expectedEmail}" from profiles.phone, but Identity has "${user.email}". The person can only log in with whichever number maps to the Identity email.`
        }`,
      );
      if (!match && user.email) {
        const digits = user.email.split('@')[0];
        console.log(`  -> number that currently works: +${digits}`);
      }
    } catch (err) {
      console.log(
        `  identity user ........ NOT FOUND for this uid (${err instanceof Error ? err.message : err})   <-- the Identity Platform account is missing entirely`,
      );
    }
  }
  console.log('\n--------------------------------------------------------------');
  console.log('To repair:  npx tsx scripts/fix-ceo-login.ts --uid <profile id> --phone +998XXXXXXXXX [--reset-password]');
}

async function repair(uid: string, rawPhone: string, resetPassword: boolean) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    console.error(`"${rawPhone}" is not a valid Uzbekistan phone number.`);
    process.exit(1);
  }
  const email = phoneToSyntheticEmail(phone);

  const [profile] = await sql<{ id: string; role: string; first_name: string; last_name: string }[]>`
    select id, role, first_name, last_name from profiles where id = ${uid}
  `;
  if (!profile) {
    console.error(`No profiles row with id ${uid}.`);
    process.exit(1);
  }

  // Guard against a typo'd --phone silently stealing another account's number.
  const [clash] = await sql<{ id: string; first_name: string; last_name: string }[]>`
    select id, first_name, last_name from profiles where phone = ${phone} and id <> ${uid}
  `;
  if (clash) {
    console.error(
      `Refusing: ${phone} is already ${clash.first_name} ${clash.last_name}'s number (profile ${clash.id}).`,
    );
    process.exit(1);
  }

  console.log(`Repairing ${profile.first_name} ${profile.last_name} (${profile.role}) -> ${phone}`);

  // 1. Identity Platform: email back in sync, account enabled.
  await auth.updateUser(uid, { email, emailVerified: true, disabled: false });
  console.log(`  identity email set to ${email}, account enabled`);

  // 2. profiles: phone in sync, active, unfrozen.
  await sql`
    update profiles
    set phone = ${phone}, is_active = true, frozen_reason = null
    where id = ${uid}
  `;
  console.log('  profiles.phone synced, is_active = true, frozen_reason cleared');

  // 3. Optional password reset.
  let tempPw: string | null = null;
  if (resetPassword) {
    tempPw = tempPassword();
    await auth.updateUser(uid, { password: tempPw });
    await sql`update profiles set must_change_password = true where id = ${uid}`;
    // Keep the Identity claim consistent so proxy.ts doesn't fight the DB.
    await auth.setCustomUserClaims(uid, { role: profile.role, mustChangePassword: true });
    console.log('  temporary password set, must_change_password = true');
  }

  // 4. Drop any stale sessions so the fix takes effect immediately.
  await auth.revokeRefreshTokens(uid);
  console.log('  live sessions revoked');

  console.log('\nDone.');
  console.log(`  Log in with:  ${phone}`);
  if (tempPw) console.log(`  Temporary password (share out of band, one-time):  ${tempPw}`);
  else console.log('  Password is unchanged — use the existing one. Add --reset-password if it is also unknown.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args.uid && args.phone) {
      await repair(String(args.uid), String(args.phone), args['reset-password'] === true);
    } else if (args.uid || args.phone) {
      console.error('Repair needs BOTH --uid and --phone.');
      process.exit(1);
    } else {
      await diagnose(typeof args.role === 'string' ? args.role : undefined);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
