/**
 * One-off backfill for AUD-31: rewrites every `group_chat_meta/{groupId}`
 * doc so the active CEO uid(s) are in `members`, letting the CEO's
 * read-only "monitor" listener past the Firestore rule for existing groups
 * (new/edited groups get this for free via the updated syncGroupChatMembers).
 *
 * Standalone — connects with bare clients (postgres via the Cloud SQL Auth
 * Proxy on 127.0.0.1:5433, and firebase-admin from GOOGLE_APPLICATION_
 * CREDENTIALS / ADC) rather than importing `server-only` modules.
 *
 * Usage:
 *   cloud-sql-proxy persons-staff-b01a83bd:europe-west3:persons-staff-db --port 5433 &
 *   npx tsx scripts/backfill-group-chat-ceo.ts
 */
import postgres from 'postgres';
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sql = postgres('postgres://postgres:rnQTe2aILZonLj0NaWkV8XBb@127.0.0.1:5433/app', { ssl: false, max: 1 });

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
initializeApp({
  credential: credsPath ? cert(credsPath) : applicationDefault(),
  projectId: process.env.GCP_PROJECT_ID ?? 'persons-staff-b01a83bd',
});
const fs = getFirestore();

async function main() {
  const ceoRows = await sql<{ id: string }[]>`select id from profiles where role = 'ceo' and is_active = true`;
  const ceoIds = ceoRows.map((r) => r.id);
  if (ceoIds.length === 0) {
    console.log('No active CEO — nothing to do.');
    await sql.end();
    return;
  }

  const groups = await sql<{ id: string; teacher_id: string | null; assigned_ta_id: string | null }[]>`
    select id, teacher_id, assigned_ta_id from groups
  `;

  let updated = 0;
  for (const g of groups) {
    const members = [...new Set([g.teacher_id, g.assigned_ta_id, ...ceoIds].filter((x): x is string => Boolean(x)))];
    await fs.doc(`group_chat_meta/${g.id}`).set({ members }, { merge: false });
    updated += 1;
    console.log(`  ${g.id}: members = ${members.length}`);
  }

  console.log(`Done. ${updated} group_chat_meta docs rewritten.`);
  await sql.end();
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
