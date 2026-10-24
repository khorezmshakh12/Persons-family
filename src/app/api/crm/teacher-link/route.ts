import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// CRM o'qituvchisini Staff (profiles) xodimiga bog'lash. profileId null bo'lsa
// bog'lanish uziladi. Shu orqali "o'qituvchi = xodim profili" amalga oshadi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { teacherId?: string; profileId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const teacherId = body.teacherId ?? '';
  const profileId = body.profileId ? String(body.profileId) : null;
  if (!teacherId) return NextResponse.json({ error: 'O‘qituvchi majburiy' }, { status: 400 });

  try {
    if (profileId) {
      const p = await sql`select 1 from profiles where id = ${profileId} and is_active = true`;
      if (!p.length) return NextResponse.json({ error: 'Xodim topilmadi' }, { status: 400 });
    }
    const res = await sql`update crm_teachers set profile_id = ${profileId} where id = ${teacherId}`;
    if (res.count === 0) return NextResponse.json({ error: 'O‘qituvchi topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] teacher link failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
