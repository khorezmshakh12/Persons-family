import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Bir martalik import — saytdan (CEO/COO). crm_import.json (window.CRM shakli)
// yuboriladi, server o'z ulanishi bilan crm_* jadvallarga yozadi. Proksi/parol
// kerak emas. Xavfsizlik: faqat CEO/COO; baza bo'sh bo'lsa seed qiladi, aks
// holda `fresh:true` talab qiladi (crm_* ni tozalab qayta yozadi).

const d = (s?: string | null) => (s && s.length >= 10 ? s.slice(0, 10) : null);
const METHODS = new Set(['cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other']);
const method = (m?: string) => (m && METHODS.has(m) ? m : 'other');
const statusOf = (s?: string) => (s === 'freeze' || s === 'frozen' ? 'frozen' : s === 'left' ? 'left' : 'active');

type Group = { gid: string; group?: string; course?: string; teacher?: string; status?: string; fee?: string; start?: string; days?: string };
type Student = { id: string; name: string; tel?: string; ptel?: string | null; sex?: string; bd?: string; scores?: number; bal?: number; groups?: Group[] };
type Payload = {
  fresh?: boolean;
  students?: Student[];
  groups?: { id: string; name: string; course?: string; teacherId?: string; days?: string; start?: string; end?: string; limit?: number }[];
  teachers?: { id: string; name: string }[];
  courses?: { name: string }[];
  payments?: { date: string; amt: number; m?: string; sid?: string; group?: string; refund?: boolean; ref?: number }[];
  expenses?: { date: string; amt: number; cat?: string; c?: string }[];
  leads?: { name?: string; tel?: string; sec?: string; course?: string; note?: string }[];
  leadSections?: { _id: string; name: string }[];
  attendance?: { sid?: string; gid?: string; date: string; p?: number; late?: number }[];
};

export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.students) || !body.students.length) {
    return NextResponse.json({ error: 'Fayl bo‘sh yoki noto‘g‘ri (students yo‘q)' }, { status: 400 });
  }

  const tables = [
    'crm_attendance', 'crm_charges', 'crm_enrollment_status_history', 'crm_discounts', 'crm_enrollments',
    'crm_payments', 'crm_lessons', 'crm_schedule', 'crm_group_teachers', 'crm_lead_activities', 'crm_leads',
    'crm_messages', 'crm_documents', 'crm_student_tags', 'crm_contacts', 'crm_groups', 'crm_students',
    'crm_tariffs', 'crm_rooms', 'crm_lead_sections', 'crm_expenses', 'crm_tags',
  ];

  try {
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from crm_students where archived_at is null`;
    if (count > 0 && !body.fresh) {
      return NextResponse.json({ error: `Bazada allaqachon ${count} o‘quvchi bor. Qayta yozish uchun fresh talab qilinadi.` }, { status: 409 });
    }

    const res = await sql.begin(async (tx) => {
      if (body.fresh) await tx.unsafe(`truncate ${tables.join(', ')} restart identity cascade`);
      await tx`insert into crm_settings (id) values (true) on conflict (id) do nothing`;

      const courseId = new Map<string, string>();
      const names = new Set<string>();
      (body.courses ?? []).forEach((c) => c.name && names.add(c.name));
      (body.groups ?? []).forEach((g) => g.course && names.add(g.course));
      for (const name of names) {
        const [r] = await tx<{ id: string }[]>`insert into crm_courses (name, created_by) values (${name}, ${me.id}) on conflict do nothing returning id`;
        courseId.set(name, r?.id ?? (await tx<{ id: string }[]>`select id from crm_courses where name = ${name} limit 1`)[0].id);
      }

      const teacherId = new Map<string, string>();
      for (const t of body.teachers ?? []) {
        const [r] = await tx<{ id: string }[]>`insert into crm_teachers (external_id, display_name, created_by) values (${t.id}, ${t.name}, ${me.id}) on conflict (external_id) do update set display_name = excluded.display_name returning id`;
        teacherId.set(t.id, r.id);
      }

      const sectionId = new Map<string, string>();
      for (const [i, s] of (body.leadSections ?? []).entries()) {
        const [r] = await tx<{ id: string }[]>`insert into crm_lead_sections (external_id, name, sort) values (${s._id}, ${s.name}, ${i}) on conflict (external_id) do update set name = excluded.name returning id`;
        sectionId.set(s._id, r.id);
      }

      const groupId = new Map<string, string>();
      for (const g of body.groups ?? []) {
        const tm = (g.name.match(/\d{1,2}[:.]\d{2}/) || [])[0]?.replace('.', ':') ?? null;
        const [r] = await tx<{ id: string }[]>`
          insert into crm_groups (external_id, name, course_id, head_teacher_id, days, start_time, student_limit, start_date, end_date, created_by)
          values (${g.id}, ${g.name}, ${g.course ? courseId.get(g.course) ?? null : null}, ${g.teacherId ? teacherId.get(g.teacherId) ?? null : null}, ${g.days ?? null}, ${tm}, ${g.limit ?? 12}, ${d(g.start)}, ${d(g.end)}, ${me.id})
          on conflict (external_id) do update set name = excluded.name returning id`;
        groupId.set(g.id, r.id);
      }

      const studentId = new Map<string, string>();
      for (const s of body.students ?? []) {
        const [r] = await tx<{ id: string }[]>`
          insert into crm_students (external_id, full_name, sex, birthday, scores, balance, created_by)
          values (${s.id}, ${s.name}, ${s.sex === 'm' || s.sex === 'w' ? s.sex : null}, ${d(s.bd)}, ${s.scores ?? 0}, ${Number(s.bal) || 0}, ${me.id})
          on conflict (external_id) do update set full_name = excluded.full_name, balance = excluded.balance returning id`;
        studentId.set(s.id, r.id);
        await tx`delete from crm_contacts where student_id = ${r.id}`;
        if (s.tel) await tx`insert into crm_contacts (student_id, kind, phone, is_primary) values (${r.id}, 'student', ${s.tel}, true)`;
        if (s.ptel) await tx`insert into crm_contacts (student_id, kind, phone) values (${r.id}, 'guardian', ${s.ptel})`;
        for (const g of s.groups ?? []) {
          const gid = groupId.get(g.gid);
          if (!gid) continue;
          await tx`
            insert into crm_enrollments (external_id, student_id, group_id, tariff_amount, activation_date, status, created_by)
            values (${`${s.id}:${g.gid}`}, ${r.id}, ${gid}, ${Number(g.fee) || 0}, ${d(g.start) ?? '2026-01-01'}, ${statusOf(g.status)}, ${me.id})
            on conflict (external_id) do update set status = excluded.status, tariff_amount = excluded.tariff_amount`;
        }
      }

      for (const p of body.payments ?? []) {
        const ext = `${p.sid ?? '?'}|${p.date}|${p.amt}|${p.group ?? ''}|${p.refund ? 'r' : ''}`;
        await tx`
          insert into crm_payments (external_id, student_id, group_name, amount, method, paid_at, is_refund, refund_amount, created_by)
          values (${ext}, ${p.sid ? studentId.get(p.sid) ?? null : null}, ${p.group ?? null}, ${p.amt}, ${method(p.m)}, ${d(p.date)}, ${!!p.refund}, ${p.ref ?? 0}, ${me.id})
          on conflict (external_id) do nothing`;
      }

      let att = 0;
      for (const a of body.attendance ?? []) {
        const sid = a.sid ? studentId.get(a.sid) : null;
        const gid = a.gid ? groupId.get(a.gid) : null;
        if (!sid || !gid) continue;
        await tx`
          insert into crm_attendance (student_id, group_id, att_date, present, is_late, created_by)
          values (${sid}, ${gid}, ${d(a.date)}, ${!!a.p}, ${!!a.late}, ${me.id})
          on conflict (student_id, group_id, att_date) do nothing`;
        att++;
      }

      for (const l of body.leads ?? []) {
        await tx`
          insert into crm_leads (section_id, name, phone, course_id, note, created_by)
          values (${l.sec ? sectionId.get(l.sec) ?? null : null}, ${l.name ?? null}, ${l.tel ?? null}, ${l.course ? courseId.get(l.course) ?? null : null}, ${l.note ?? null}, ${me.id})`;
      }
      for (const e of body.expenses ?? []) {
        await tx`insert into crm_expenses (category, amount, spent_at, note, created_by) values (${e.cat ?? null}, ${e.amt}, ${d(e.date)}, ${e.c ?? null}, ${me.id})`;
      }

      return { students: studentId.size, groups: groupId.size, teachers: teacherId.size, payments: (body.payments ?? []).length, attendance: att };
    });

    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error('[crm] import failed', e);
    return NextResponse.json({ error: 'Import xatosi — ' + (e instanceof Error ? e.message : 'nomaʼlum') }, { status: 500 });
  }
}
