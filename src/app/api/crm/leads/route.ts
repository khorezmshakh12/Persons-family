import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi lid qo'shish. Kurs nomi berilsa, topiladi yoki yaratiladi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { name?: string; phone?: string; course?: string; sectionId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  if (!name && !phone) return NextResponse.json({ error: 'Ism yoki telefon majburiy' }, { status: 400 });

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
        insert into crm_leads (section_id, name, phone, course_id, note, status, created_by)
        values (${sectionId}, ${name || null}, ${phone || null}, ${courseId}, ${body.note ?? null}, 'open', ${me.id})
        returning id`;
      return l.id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[crm] create lead failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
