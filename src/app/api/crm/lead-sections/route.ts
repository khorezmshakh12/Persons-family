import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi bosqich (board ustuni) qo'shish.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Nom majburiy' }, { status: 400 });

  try {
    const [row] = await sql<{ id: string }[]>`
      insert into crm_lead_sections (name, sort, kind)
      values (${name}, (select coalesce(max(sort), 0) + 1 from crm_lead_sections), 'custom')
      returning id`;
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error('[crm] create lead section failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Bosqichni nomlash yoki tartibini o'zgartirish.
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { sectionId?: string; name?: string; order?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  try {
    // Tartibni o'zgartirish: id'lar yangi tartibda.
    if (Array.isArray(body.order)) {
      const order = body.order;
      await sql.begin(async (tx) => {
        for (let i = 0; i < order.length; i++) {
          await tx`update crm_lead_sections set sort = ${i} where id = ${order[i]}`;
        }
      });
      return NextResponse.json({ ok: true });
    }

    // Nomlash.
    if (body.sectionId && body.name) {
      const res = await sql`update crm_lead_sections set name = ${body.name} where id = ${body.sectionId} and archived_at is null`;
      if (res.count === 0) return NextResponse.json({ error: 'Bosqich topilmadi' }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  } catch (e) {
    console.error('[crm] update lead section failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Bosqichni arxivlash. Lidlari o'chmaydi — So‘rovlar bucketiga qaytadi.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { sectionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const sectionId = body.sectionId;
  if (!sectionId) return NextResponse.json({ error: 'Bosqich majburiy' }, { status: 400 });

  try {
    const ok = await sql.begin(async (tx) => {
      await tx`update crm_leads set section_id = null where section_id = ${sectionId}`;
      const res = await tx`update crm_lead_sections set archived_at = now() where id = ${sectionId} and archived_at is null`;
      return res.count > 0;
    });
    if (!ok) return NextResponse.json({ error: 'Bosqich topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete lead section failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
