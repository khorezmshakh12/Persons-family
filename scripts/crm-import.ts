/**
 * CRM of Persons — bir martalik import (Bosqich 1).
 *
 * schoolup'dan read-only ko'chirilgan eksportni (window.CRM shaklidagi JSON)
 * crm_* jadvallariga yozadi. Ma'lumot PII bo'lgani uchun repoga committ
 * QILINMAYDI — fayl yo'li argument sifatida beriladi, ma'lumot foydalanuvchi
 * mashinasida qoladi.
 *
 * Idempotent: external_id (schoolup ID) bo'yicha upsert; qayta ishga tushsa
 * dublikat chiqmaydi. Tozadan boshlash uchun `--fresh` crm_* ni truncate qiladi.
 *
 * Eksport JSON tayyorlash (crm_data.js dan):
 *   node -e "const s=require('fs').readFileSync('crm_data.js','utf8');\
 *     require('fs').writeFileSync('crm_import.json', s.replace(/^window\.CRM=/,'').replace(/;\s*$/,''))"
 *
 * Ishlatish:
 *   DATABASE_URL=... npx tsx scripts/crm-import.ts --file C:/Users/.../crm_import.json [--fresh] [--dry-run]
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

type Group = { gid: string; group: string; course?: string; teacher?: string; status?: string; fee?: string; start?: string; days?: string };
type Student = { id: string; name: string; tel?: string; ptel?: string | null; sex?: string; bd?: string; scores?: number; bal?: number; groups?: Group[] };
type Export = {
  students?: Student[];
  groups?: { id: string; name: string; course?: string; teacherId?: string; room?: string; days?: string; start?: string; end?: string; limit?: number; fee?: string | null }[];
  teachers?: { id: string; name: string }[];
  courses?: { name: string }[];
  payments?: { date: string; amt: number; m?: string; sid?: string; sn?: string; group?: string; refund?: boolean; ref?: number }[];
  expenses?: { date: string; amt: number; cat?: string; c?: string }[];
  leads?: { name?: string; tel?: string; sec?: string; course?: string; src?: string; note?: string; date?: string }[];
  leadSections?: { _id: string; name: string }[];
  attendance?: { sid?: string; gid?: string; date: string; p?: number; late?: number }[];
};

const fileArg = process.argv[process.argv.indexOf('--file') + 1];
const fresh = process.argv.includes('--fresh');
const dryRun = process.argv.includes('--dry-run');
if (!fileArg || fileArg.startsWith('--')) {
  console.error('--file <export.json> is required');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
const sql = postgres(url, { ssl: isLocal ? false : 'require', max: 1 });

const data = JSON.parse(readFileSync(fileArg, 'utf8')) as Export;
const d = (s?: string | null) => (s && s.length >= 10 ? s.slice(0, 10) : null); // 'YYYY-MM-DD' | null
const METHODS = new Set(['cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other']);
const method = (m?: string) => (m && METHODS.has(m) ? m : 'other');
const statusOf = (s?: string) => (s === 'freeze' || s === 'frozen' ? 'frozen' : s === 'left' ? 'left' : 'active');

async function main() {
  const tables = [
    'crm_attendance', 'crm_charges', 'crm_enrollment_status_history', 'crm_discounts', 'crm_enrollments',
    'crm_payments', 'crm_lessons', 'crm_schedule', 'crm_group_teachers', 'crm_lead_activities', 'crm_leads',
    'crm_messages', 'crm_documents', 'crm_student_tags', 'crm_contacts', 'crm_teacher_payroll',
    'crm_groups', 'crm_students', 'crm_tariffs', 'crm_teachers', 'crm_levels', 'crm_courses',
    'crm_rooms', 'crm_sources', 'crm_lead_sections', 'crm_expenses', 'crm_tags',
  ];

  await sql.begin(async (tx) => {
    if (fresh) {
      await tx.unsafe(`truncate ${tables.join(', ')} restart identity cascade`);
      console.log('fresh: truncated crm_* tables');
    }

    // settings (singleton)
    await tx`insert into crm_settings (id) values (true) on conflict (id) do nothing`;

    // courses (by name) → id map
    const courseId = new Map<string, string>();
    const courseNames = new Set<string>();
    (data.courses ?? []).forEach((c) => c.name && courseNames.add(c.name));
    (data.groups ?? []).forEach((g) => g.course && courseNames.add(g.course));
    for (const name of courseNames) {
      const [row] = await tx`
        insert into crm_courses (name) values (${name})
        on conflict do nothing returning id`;
      const id = row?.id ?? (await tx`select id from crm_courses where name = ${name} limit 1`)[0].id;
      courseId.set(name, id);
    }

    // teachers (external_id = schoolup id)
    const teacherId = new Map<string, string>();
    for (const t of data.teachers ?? []) {
      const [row] = await tx`
        insert into crm_teachers (external_id, display_name) values (${t.id}, ${t.name})
        on conflict (external_id) do update set display_name = excluded.display_name
        returning id`;
      teacherId.set(t.id, row.id);
    }

    // lead sections
    const sectionId = new Map<string, string>();
    for (const [i, s] of (data.leadSections ?? []).entries()) {
      const [row] = await tx`
        insert into crm_lead_sections (external_id, name, sort) values (${s._id}, ${s.name}, ${i})
        on conflict (external_id) do update set name = excluded.name
        returning id`;
      sectionId.set(s._id, row.id);
      sectionId.set(s.name, row.id);
    }

    // groups
    const groupId = new Map<string, string>();
    for (const g of data.groups ?? []) {
      const tmRaw = (g.name.match(/\d{1,2}[:.]\d{2}/) || [])[0]?.replace('.', ':');
      let tm: string | null = null;
      if (tmRaw) {
        const [h, mm] = tmRaw.split(':');
        const t = `${h.padStart(2, '0')}:${mm}`;
        tm = /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
      }
      const [row] = await tx`
        insert into crm_groups (external_id, name, course_id, head_teacher_id, room_id, days, start_time, student_limit, start_date, end_date)
        values (${g.id}, ${g.name}, ${g.course ? courseId.get(g.course) ?? null : null},
                ${g.teacherId ? teacherId.get(g.teacherId) ?? null : null}, null, ${g.days ?? null},
                ${tm}, ${g.limit ?? 12}, ${d(g.start)}, ${d(g.end)})
        on conflict (external_id) do update set name = excluded.name
        returning id`;
      groupId.set(g.id, row.id);
    }

    // students + contacts + enrollments
    const studentId = new Map<string, string>();
    for (const s of data.students ?? []) {
      const [row] = await tx`
        insert into crm_students (external_id, full_name, sex, birthday, scores, balance)
        values (${s.id}, ${s.name}, ${s.sex === 'm' || s.sex === 'w' ? s.sex : null}, ${d(s.bd)}, ${s.scores ?? 0}, ${Number(s.bal) || 0})
        on conflict (external_id) do update set full_name = excluded.full_name, balance = excluded.balance
        returning id`;
      studentId.set(s.id, row.id);
      // contacts — faqat yangi importda (dublikat bo'lmasligi uchun avval tozalaymiz)
      await tx`delete from crm_contacts where student_id = ${row.id}`;
      if (s.tel) await tx`insert into crm_contacts (student_id, kind, phone, is_primary) values (${row.id}, 'student', ${s.tel}, true)`;
      if (s.ptel) await tx`insert into crm_contacts (student_id, kind, phone) values (${row.id}, 'guardian', ${s.ptel})`;
      // enrollments (abonement) — activation_date SAQLANADI
      for (const g of s.groups ?? []) {
        const gid = groupId.get(g.gid);
        if (!gid) continue;
        const ext = `${s.id}:${g.gid}`;
        await tx`
          insert into crm_enrollments (external_id, student_id, group_id, tariff_amount, activation_date, status)
          values (${ext}, ${row.id}, ${gid}, ${Number(g.fee) || 0}, ${d(g.start) ?? '2026-01-01'}, ${statusOf(g.status)})
          on conflict (external_id) do update set status = excluded.status, tariff_amount = excluded.tariff_amount`;
      }
    }

    // payments (sintetik external_id — qayta importda dublikat bo'lmasin)
    for (const p of data.payments ?? []) {
      const ext = `${p.sid ?? '?'}|${p.date}|${p.amt}|${p.group ?? ''}|${p.refund ? 'r' : ''}`;
      await tx`
        insert into crm_payments (external_id, student_id, group_name, amount, method, paid_at, is_refund, refund_amount)
        values (${ext}, ${p.sid ? studentId.get(p.sid) ?? null : null}, ${p.group ?? null}, ${p.amt},
                ${method(p.m)}, ${d(p.date)}, ${!!p.refund}, ${p.ref ?? 0})
        on conflict (external_id) do nothing`;
    }

    // attendance (unique student+group+date)
    let att = 0;
    for (const a of data.attendance ?? []) {
      const sid = a.sid ? studentId.get(a.sid) : null;
      const gid = a.gid ? groupId.get(a.gid) : null;
      if (!sid || !gid) continue;
      await tx`
        insert into crm_attendance (student_id, group_id, att_date, present, is_late)
        values (${sid}, ${gid}, ${d(a.date)}, ${!!a.p}, ${!!a.late})
        on conflict (student_id, group_id, att_date) do nothing`;
      att++;
    }

    // leads
    for (const l of data.leads ?? []) {
      await tx`
        insert into crm_leads (section_id, name, phone, course_id, note)
        values (${l.sec ? sectionId.get(l.sec) ?? null : null}, ${l.name ?? null}, ${l.tel ?? null},
                ${l.course ? courseId.get(l.course) ?? null : null}, ${l.note ?? null})`;
    }

    // expenses
    for (const e of data.expenses ?? []) {
      await tx`
        insert into crm_expenses (category, amount, spent_at, note)
        values (${e.cat ?? null}, ${e.amt}, ${d(e.date)}, ${e.c ?? null})`;
    }

    console.log(
      `import: ${studentId.size} students, ${groupId.size} groups, ${teacherId.size} teachers, ` +
        `${courseId.size} courses, ${(data.payments ?? []).length} payments, ${att} attendance, ` +
        `${(data.leads ?? []).length} leads, ${(data.expenses ?? []).length} expenses`,
    );
    if (dryRun) {
      console.log('--dry-run: rolling back');
      throw new Error('__rollback__');
    }
  }).catch((e) => {
    if (e instanceof Error && e.message === '__rollback__') return;
    throw e;
  });

  await sql.end();
  console.log('done');
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
