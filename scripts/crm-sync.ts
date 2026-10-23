/**
 * CRM sinxron (2026-10-23): schoolup'dan read-only olingan yangi holatni
 * Operation HQ › O'quvchilar (crm_*) ga moslaydi.
 *
 *   * O'quvchi: external_id (schoolup ID), bo'lmasa to'liq ism bo'yicha
 *     (external_id'siz qatorlar orasida). Topilmasa — yangi qo'shiladi.
 *   * Abonement: activation_date = schoolup'dagi aktivlashtirilgan sana
 *     (guruhga qo'shilgan sana emas); billing_start = faol abonementlarning
 *     eng erta aktiv sanasi — keyingi to'lov kuni shundan hisoblanadi.
 *   * To'lov: external_id 'su:<id>'. Shu o'quvchida shu summa ±1 kun ichida
 *     bor bo'lsa (Operation HQ'da qo'lda kiritilgan) — qayta yozilmaydi.
 *   * Balans: schoolup'dagi balansga tenglashtiriladi.
 *
 * Ishlatish (standart — faqat hisobot, hech narsa yozmaydi):
 *   DATABASE_URL=... npx tsx scripts/crm-sync.ts --file <sync.json> [--apply]
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

type Membership = { gid: string; group: string; status: string; activation: string | null; added: string | null; fee: number; tariff?: string };
type Parent = { name?: string; tel?: string; relation?: string; isMain?: boolean };
type Student = { id: string; name: string; tel: string; ptel: string; parents: Parent[]; sex?: string; bd?: string | null; bal: number; scores: number; groups: Membership[] };
type Payment = { id: string; sid: string | null; sn?: string; date: string; amt: number; m?: string; group?: string; refund: boolean; ref: number };
type Group = { id: string; name: string; course?: string; days?: string; start?: string | null; end?: string | null };
type Sync = { students: Student[]; payments: Payment[]; groups: Group[] };

const fileArg = process.argv[process.argv.indexOf('--file') + 1];
const apply = process.argv.includes('--apply');
if (!fileArg || fileArg.startsWith('--')) {
  console.error('--file <sync.json> is required');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
const sql = postgres(url, { ssl: isLocal ? false : 'require', max: 1 });

const data = JSON.parse(readFileSync(fileArg, 'utf8')) as Sync;
const METHODS = new Set(['cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other']);
const method = (m?: string) => (m && METHODS.has(m) ? m : 'other');
const enrStatus = (s: string) => (s === 'active' ? 'active' : s === 'freeze' ? 'frozen' : s === 'deleted' ? 'finished' : 'left');
const norm = (s: string) => s.toLowerCase().replace(/[`'‘’ʻʼ]/g, '').replace(/\s+/g, ' ').trim();
const kindOf = (r?: string) => {
  const x = norm(r ?? '');
  return x.startsWith('ota') ? 'father' : x.startsWith('ona') ? 'mother' : 'guardian';
};
const unescape = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const dayDiff =(a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

class DryRun extends Error {}

async function main() {
  const report = { newStudents: [] as string[], matchedByName: [] as string[], startChanged: [] as string[], balance: [] as string[], newGroups: [] as string[], enrollments: 0, payments: [] as string[], dupPayments: 0, unknownPayer: [] as string[] };

  await sql.begin(async (tx) => {
    // groups
    const groupId = new Map<string, string>();
    for (const r of await tx<{ id: string; ext: string }[]>`select id, external_id as ext from crm_groups where external_id is not null`) groupId.set(r.ext, r.id);
    const groupInfo = new Map(data.groups.map((g) => [g.id, g]));
    const ensureGroup = async (gid: string, name: string) => {
      if (groupId.has(gid)) return groupId.get(gid)!;
      const g = groupInfo.get(gid);
      const course = g?.course ? (await tx<{ id: string }[]>`select id from crm_courses where name = ${g.course} limit 1`)[0]?.id ?? null : null;
      const [row] = await tx<{ id: string }[]>`
        insert into crm_groups (external_id, name, course_id, days, start_date, end_date)
        values (${gid}, ${unescape(g?.name ?? name)}, ${course}, ${g?.days ?? null}, ${g?.start ?? null}, ${g?.end ?? null}) returning id`;
      groupId.set(gid, row.id);
      report.newGroups.push(g?.name ?? name);
      return row.id;
    };

    // students
    const existing = await tx<{ id: string; ext: string | null; name: string; balance: number; billing_start: string | null; archived: boolean }[]>`
      select id, external_id as ext, full_name as name, balance::float8 as balance, billing_start::text as billing_start, archived_at is not null as archived
      from crm_students`;
    const byExt = new Map(existing.filter((s) => s.ext).map((s) => [s.ext!, s]));
    const byName = new Map<string, (typeof existing)[number]>();
    for (const s of existing) if (!s.ext) byName.set(norm(s.name), s);
    const sidOf = new Map<string, string>();

    for (const s of data.students) {
      let row = byExt.get(s.id);
      if (!row) {
        const hit = byName.get(norm(s.name));
        if (hit) {
          await tx`update crm_students set external_id = ${s.id} where id = ${hit.id}`;
          byName.delete(norm(s.name));
          report.matchedByName.push(s.name);
          row = hit;
        }
      }
      if (!row) {
        const [ins] = await tx<{ id: string }[]>`
          insert into crm_students (external_id, full_name, sex, birthday, scores, balance)
          values (${s.id}, ${s.name}, ${s.sex === 'm' || s.sex === 'w' ? s.sex : null}, ${s.bd ?? null}, ${s.scores}, ${s.bal})
          returning id`;
        if (s.tel) await tx`insert into crm_contacts (student_id, kind, phone, is_primary) values (${ins.id}, 'student', ${s.tel}, true)`;
        const parents = s.parents.length ? s.parents : s.ptel ? [{ tel: s.ptel, relation: '' }] : [];
        for (const p of parents) {
          if (!p.tel) continue;
          await tx`insert into crm_contacts (student_id, kind, name, phone, is_primary) values (${ins.id}, ${kindOf(p.relation)}, ${p.name ?? null}, ${p.tel}, ${!!p.isMain})`;
        }
        report.newStudents.push(s.name);
        row = { id: ins.id, ext: s.id, name: s.name, balance: s.bal, billing_start: null, archived: false };
      }
      sidOf.set(s.id, row.id);

      // enrollments — activation_date = schoolup aktiv sanasi
      for (const m of s.groups) {
        if (!m.activation) continue;
        const status = enrStatus(m.status);
        const ext = `${s.id}:${m.gid}`;
        const [cur] = await tx<{ id: string }[]>`select id from crm_enrollments where external_id = ${ext}`;
        if (cur) {
          await tx`update crm_enrollments set activation_date = ${m.activation}, tariff_amount = ${m.fee}, status = ${status}, updated_at = now() where id = ${cur.id}`;
        } else {
          if (status === 'finished') continue;
          const gid = await ensureGroup(m.gid, m.group);
          const [other] = await tx<{ id: string }[]>`select id from crm_enrollments where student_id = ${row.id} and group_id = ${gid} and status <> 'finished' limit 1`;
          if (other) {
            await tx`update crm_enrollments set external_id = ${ext}, activation_date = ${m.activation}, tariff_amount = ${m.fee}, status = ${status}, updated_at = now() where id = ${other.id}`;
          } else {
            await tx`insert into crm_enrollments (external_id, student_id, group_id, tariff_amount, activation_date, status)
              values (${ext}, ${row.id}, ${gid}, ${m.fee}, ${m.activation}, ${status})`;
          }
        }
        report.enrollments++;
      }

      // billing_start = eng erta faol aktiv sana
      const actives = s.groups.filter((m) => m.status === 'active' && m.activation).map((m) => m.activation!).sort();
      const start = actives[0] ?? null;
      if (start !== row.billing_start) {
        await tx`update crm_students set billing_start = ${start}, updated_at = now() where id = ${row.id}`;
        report.startChanged.push(`${s.name}: ${row.billing_start ?? '—'} → ${start ?? '—'}`);
      }
    }

    // payments
    for (const p of data.payments) {
      const sid = p.sid ? sidOf.get(p.sid) : undefined;
      if (!sid) {
        report.unknownPayer.push(`${p.sn ?? '?'} ${p.date} ${p.amt}`);
        continue;
      }
      const ext = `su:${p.id}`;
      const [byId] = await tx`select 1 from crm_payments where external_id = ${ext}`;
      if (byId) continue;
      const near = await tx<{ paid_at: string }[]>`
        select paid_at::text as paid_at from crm_payments
        where student_id = ${sid} and amount = ${p.amt} and is_refund = ${p.refund}
          and paid_at between ${p.date}::date - 1 and ${p.date}::date + 1`;
      if (near.some((n) => dayDiff(n.paid_at, p.date) <= 1)) {
        report.dupPayments++;
        continue;
      }
      await tx`
        insert into crm_payments (external_id, student_id, group_name, amount, method, paid_at, is_refund, refund_amount, note)
        values (${ext}, ${sid}, ${p.group ?? null}, ${p.amt}, ${method(p.m)}, ${p.date}, ${p.refund}, ${p.ref}, 'schoolup')`;
      await tx`insert into crm_student_log (student_id, kind, text, amount)
        values (${sid}, 'pay', ${`${p.sn ?? ''} — ${p.amt.toLocaleString('ru-RU')} so‘m to‘lov (schoolup, ${p.date})`}, ${p.amt})`;
      report.payments.push(`${p.sn} ${p.date} ${p.amt}${p.refund ? ' (qaytarish)' : ''}`);
    }

    // balance = schoolup balance
    for (const s of data.students) {
      const id = sidOf.get(s.id)!;
      const [cur] = await tx<{ balance: number }[]>`select balance::float8 as balance from crm_students where id = ${id}`;
      if (Number(cur.balance) !== s.bal) {
        await tx`update crm_students set balance = ${s.bal}, updated_at = now() where id = ${id}`;
        report.balance.push(`${s.name}: ${cur.balance} → ${s.bal}`);
      }
    }

    const inSync = new Set(sidOf.values());
    const notInSchoolup = existing.filter((s) => !s.archived && !inSync.has(s.id)).map((s) => s.name);

    const list = (title: string, xs: string[]) => console.log(`\n${title}: ${xs.length}${xs.length ? '\n  ' + xs.join('\n  ') : ''}`);
    list('Yangi o‘quvchilar', report.newStudents);
    list('Ism bo‘yicha bog‘landi', report.matchedByName);
    list('Yangi guruhlar', report.newGroups);
    console.log(`\nAbonementlar yangilandi: ${report.enrollments}`);
    list('To‘lov sanasi (billing_start) o‘zgardi', report.startChanged);
    list('Yangi to‘lovlar', report.payments);
    console.log(`\nAllaqachon bor to‘lovlar (o‘tkazildi): ${report.dupPayments}`);
    list('O‘quvchisi topilmagan to‘lovlar', report.unknownPayer);
    list('Balans o‘zgardi', report.balance);
    list('Operation HQ’da bor, schoolup faol ro‘yxatida yo‘q (tegilmadi)', notInSchoolup);

    if (!apply) throw new DryRun();
  }).catch((e) => {
    if (e instanceof DryRun) console.log('\nDRY RUN — hech narsa yozilmadi. Yozish uchun --apply qo‘shing.');
    else throw e;
  });
  if (apply) console.log('\nAPPLIED — o‘zgarishlar bazaga yozildi.');
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
