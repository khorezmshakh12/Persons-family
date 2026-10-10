import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import type { Profile } from '@/lib/auth/session';
import { loadCalendar } from '@/lib/team-life-data';
import { toIcs } from '@/lib/team-life';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

/**
 * Personal calendar feed (.ics) for phone / Google / Outlook calendars.
 * Auth is the unguessable per-user token from calendar_tokens (rotating or
 * deleting it kills the link at once); deactivated staff get nothing.
 * Only the viewer's own scope is exported, never lessons or everyone's tasks.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return new NextResponse('Not found', { status: 404 });
  const [profile] = await sql<Profile[]>`
    select p.*, array(select r.role::text from profile_roles r where r.user_id = p.id order by r.role) as extra_roles,
      (select coalesce(jsonb_object_agg(a.section, a.allow), '{}'::jsonb) from section_access a where a.user_id = p.id) as section_overrides
    from calendar_tokens c join profiles p on p.id = c.user_id
    where c.token = ${t} and p.is_active`;
  if (!profile) return new NextResponse('Not found', { status: 404 });

  const today = tashkentDayKey();
  const events = (await loadCalendar(profile, addDaysToKey(today, -30), addDaysToKey(today, 120), 'mine')).filter((e) => e.layer !== 'lesson');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return new NextResponse(toIcs(events, stamp, 'Persons — ish kalendari'), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, max-age=900',
      'content-disposition': 'inline; filename="persons.ics"',
    },
  });
}
