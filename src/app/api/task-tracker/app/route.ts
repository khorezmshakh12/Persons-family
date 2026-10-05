import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { canSeeFor } from '@/lib/permissions';
import { TRACKER_HTML } from '@/tracker/tracker-html';
import { trackerBridge } from '@/tracker/bridge';

export const dynamic = 'force-dynamic';

/** The Task Tracker page, 1:1 from the owner's HTML, seeded with the signed-in
 * employee's own workspace — never anyone else's. */
export async function GET(req: Request) {
  const { profile } = await getAuthState();
  if (!profile) return NextResponse.redirect(new URL('/staff/uz/login?reason=session', req.url));
  if (!canSeeFor(profile, 'taskTracker')) return new NextResponse('Forbidden', { status: 403 });
  const l = new URL(req.url).searchParams.get('l');
  const lang = l === 'ru' ? 'ru' : l === 'en' ? 'en' : 'uz';
  let data: unknown = null;
  try {
    const [row] = await sql<{ data: unknown }[]>`select data from task_tracker where user_id = ${profile.id}`;
    data = row?.data ?? null;
  } catch (e) {
    console.error('task-tracker load failed', e instanceof Error ? e.message : e);
    return new NextResponse("Ma'lumotni yuklab bo'lmadi", { status: 500 });
  }
  const html = TRACKER_HTML.replace(
    '<head>',
    `<head>${trackerBridge({ data, lang, api: '/staff/api/task-tracker/state' })}`,
  );
  return new NextResponse(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
