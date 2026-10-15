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

  let body: {
    studentId?: string; groupId?: string; date?: string; present?: boolean; late?: boolean;
    bulk?: { studentId: string; present?: boolean; late?: boolean }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const groupId = body.groupId;
  const date = (body.date ?? '').slice(0, 10);
  if (!groupId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Guruh va sana majburiy' }, { status: 400 });
  }

  try {
    // Ko'p o'quvchi uchun bir martada (masalan "Hammasi keldi") — bitta tranzaksiya.
    if (Array.isArray(body.bulk)) {
      const rows = body.bulk.filter((r) => r && r.studentId);
      if (!rows.length) return NextResponse.json({ error: 'Ro‘yxat bo‘sh' }, { status: 400 });
      await sql.begin(async (tx) => {
        for (const r of rows) {
          const present = !!r.present;
          await tx`
            insert into crm_attendance (student_id, group_id, att_date, present, is_late, created_by)
            values (${r.studentId}, ${groupId}, ${date}, ${present}, ${present && !!r.late}, ${me.id})
            on conflict (student_id, group_id, att_date)
            do update set present = excluded.present, is_late = excluded.is_late, created_by = excluded.created_by`;
        }
      });
      return NextResponse.json({ ok: true, count: rows.length });
    }

    if (!body.studentId) return NextResponse.json({ error: 'O‘quvchi majburiy' }, { status: 400 });
    const present = !!body.present;
    await sql`
      insert into crm_attendance (student_id, group_id, att_date, present, is_late, created_by)
      values (${body.studentId}, ${groupId}, ${date}, ${present}, ${present && !!body.late}, ${me.id})
      on conflict (student_id, group_id, att_date)
      do update set present = excluded.present, is_late = excluded.is_late, created_by = excluded.created_by`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] mark attendance failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
