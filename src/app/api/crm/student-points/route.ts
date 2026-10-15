import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// O'quvchining ballari (scores) va tangalarini (coins) belgilash.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { studentId?: string; scores?: number | string; coins?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const studentId = body.studentId ?? '';
  if (!studentId) return NextResponse.json({ error: 'O‘quvchi majburiy' }, { status: 400 });
  const scores = Math.max(0, Math.round(Number(body.scores) || 0));
  const coins = Math.max(0, Math.round(Number(body.coins) || 0));

  try {
    const res = await sql`update crm_students set scores = ${scores}, coins = ${coins}, updated_at = now() where id = ${studentId} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'O‘quvchi topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] update points failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
