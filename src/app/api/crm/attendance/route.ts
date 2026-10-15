import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Bitta davomat yozuvini belgilash (o'quvchi + guruh + sana). Takroriy
// belgilashda yangilanadi (unique student_id+group_id+att_date). late=true
// present'ni nazarda tutadi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { studentId?: string; groupId?: string; date?: string; present?: boolean; late?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const { studentId, groupId } = body;
  const date = (body.date ?? '').slice(0, 10);
  if (!studentId || !groupId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'O‘quvchi, guruh va sana majburiy' }, { status: 400 });
  }
  const present = !!body.present;
  const late = present && !!body.late;

  try {
    await sql`
      insert into crm_attendance (student_id, group_id, att_date, present, is_late, created_by)
      values (${studentId}, ${groupId}, ${date}, ${present}, ${late}, ${me.id})
      on conflict (student_id, group_id, att_date)
      do update set present = excluded.present, is_late = excluded.is_late, created_by = excluded.created_by`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] mark attendance failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
