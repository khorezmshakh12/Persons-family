import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { sql, toJson } from '@/lib/db/client';
import { canSeeFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2_000_000;

/** Saves the signed-in employee's own Task Tracker workspace. The owner is
 * always the session's user — the body carries no user id. */
export async function PUT(req: Request) {
  const { profile } = await getAuthState();
  if (!profile) return NextResponse.json({ error: 'session' }, { status: 401 });
  if (!canSeeFor(profile, 'taskTracker')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: 'tooLarge' }, { status: 413 });
  let data: unknown;
  try {
    data = (JSON.parse(raw) as { data?: unknown }).data;
  } catch {
    return NextResponse.json({ error: 'badRequest' }, { status: 400 });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('months' in data)) {
    return NextResponse.json({ error: 'badRequest' }, { status: 400 });
  }
  try {
    await sql`
      insert into task_tracker (user_id, data, updated_at)
      values (${profile.id}, ${sql.json(toJson(data))}, now())
      on conflict (user_id) do update set data = excluded.data, updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('task-tracker save failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'saveFailed' }, { status: 500 });
  }
}
