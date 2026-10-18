import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi lid qo'shish. Kurs nomi berilsa, topiladi yoki yaratiladi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { name?: string; phone?: string; course?: string; sectionId?: string; note?: string; source?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  if (!name && !phone) return NextResponse.json({ error: 'Ism yoki telefon majburiy' }, { status: 400 });
  const source = (body.source ?? '').trim() || null;
  const branch = ['persons_lc', 'pekin', 'social', 'it'].includes(body.branch ?? '') ? body.branch! : 'persons_lc';

  try {
    const id = await sql.begin(async (tx) => {
      let courseId: string | null = null;
      const course = (body.course ?? '').trim();
      if (course) {
        const [r] = await tx<{ id: string }[]>`insert into crm_courses (name, created_by) values (${course}, ${me.id}) on conflict do nothing returning id`;
        courseId = r?.id ?? (await tx<{ id: string }[]>`select id from crm_courses where name = ${course} limit 1`)[0]?.id ?? null;
      }
      let sectionId: string | null = null;
      if (body.sectionId) {
        const [s] = await tx<{ id: string }[]>`select id from crm_lead_sections where id = ${body.sectionId} limit 1`;
        sectionId = s?.id ?? null;
      }
      const [l] = await tx<{ id: string }[]>`
        insert into crm_leads (section_id, name, phone, course_id, note, source, status, branch, created_by)
        values (${sectionId}, ${name || null}, ${phone || null}, ${courseId}, ${body.note ?? null}, ${source}, 'open', ${branch}, ${me.id})
        returning id`;
      return l.id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[crm] create lead failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Lidni tahrirlash. Kurs nomi berilsa, topiladi yoki yaratiladi.
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { leadId?: string; name?: string; phone?: string; course?: string; sectionId?: string; note?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const leadId = (body.leadId ?? '').trim();
  const name = (body.name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  if (!leadId || (!name && !phone)) return NextResponse.json({ error: 'Lid va ism yoki telefon majburiy' }, { status: 400 });

  try {
    const ok = await sql.begin(async (tx) => {
      let courseId: string | null = null;
      const course = (body.course ?? '').trim();
      if (course) {
        const [r] = await tx<{ id: string }[]>`insert into crm_courses (name, created_by) values (${course}, ${me.id}) on conflict do nothing returning id`;
        courseId = r?.id ?? (await tx<{ id: string }[]>`select id from crm_courses where name = ${course} limit 1`)[0]?.id ?? null;
      }
      let sectionResolved: string | null = null;
      if (body.sectionId) {
        const [s] = await tx<{ id: string }[]>`select id from crm_lead_sections where id = ${body.sectionId} limit 1`;
        sectionResolved = s?.id ?? null;
      }
      const res = await tx`update crm_leads set name = ${name || null}, phone = ${phone || null}, course_id = ${courseId}, section_id = ${sectionResolved}, note = ${body.note ?? null}, source = ${(body.source ?? '').trim() || null}, updated_at = now() where id = ${leadId}`;
      return res.count > 0;
    });
    if (!ok) return NextResponse.json({ error: 'Lid topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] update lead failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Lidni o'chirish. Bog'liq qatorlar FK orqali kaskad/null bo'ladi.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { leadId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  if (!body.leadId) return NextResponse.json({ error: 'Lid majburiy' }, { status: 400 });

  try {
    const res = await sql`delete from crm_leads where id = ${body.leadId}`;
    if (res.count === 0) return NextResponse.json({ error: 'Lid topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete lead failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
