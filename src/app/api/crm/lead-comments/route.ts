import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Lid uchun izohlar tasmasini o'qish.
export async function GET(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  const leadId = new URL(req.url).searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'Lid majburiy' }, { status: 400 });

  try {
    const rows = await sql<{ id: string; kind: string; body: string | null; created_at: string | null; author: string | null }[]>`
      select a.id, a.kind, a.body, a.created_at, trim(concat(p.first_name, ' ', p.last_name)) as author
      from crm_lead_activities a
      left join profiles p on p.id = a.created_by
      where a.lead_id = ${leadId}
      order by a.created_at desc
      limit 200`;
    return NextResponse.json({
      ok: true,
      items: rows.map((r) => ({
        id: String(r.id),
        kind: r.kind,
        body: r.body,
        date: r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '',
        author: r.author || '',
      })),
    });
  } catch (e) {
    console.error('[crm] read lead comments failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Lidga izoh qo'shish.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { leadId?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const leadId = (body.leadId ?? '').trim();
  const text = (body.body ?? '').trim();
  if (!leadId || !text) return NextResponse.json({ error: 'Lid va izoh majburiy' }, { status: 400 });

  try {
    await sql`insert into crm_lead_activities (lead_id, kind, body, created_by) values (${leadId}, 'note', ${text}, ${me.id})`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] create lead comment failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
