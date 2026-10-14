import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor, isKnownRole, ROLE_DEPT } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { tashkentDayKey } from '@/lib/time';
import { DAY_RE, type AttendanceStatus } from '@/lib/attendance';
import { AttendanceView, type AttendanceRow } from '@/components/attendance/attendance-view';

export const dynamic = 'force-dynamic';

/** Xodimlar davomati (2026-10-14) — the owner's attendance module, 1:1.
 * Staff come from profiles (no "add employee"); only the CEO, COO and
 * Administrative Manager open it (SECTION_ROLES.attendance). */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'attendance')) notFound();
  const t = await getTranslations('staff');

  const today = tashkentDayKey();
  const sp = await searchParams;
  const day = sp.day && DAY_RE.test(sp.day) ? sp.day : today;

  const [people, records] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
      select id, first_name, last_name, role from profiles
      where is_active order by first_name, last_name`,
    sql<{ profile_id: string; check_in: string | null; check_out: string | null; status: AttendanceStatus; note: string }[]>`
      select profile_id, check_in, check_out, status, note from staff_attendance where day = ${day}`,
  ]);
  const byId = new Map(records.map((r) => [r.profile_id, r]));

  const rows: AttendanceRow[] = people.map((p) => {
    const r = byId.get(p.id);
    return {
      id: p.id,
      name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      roleLabel: t.has(`roles.${p.role}`) ? t(`roles.${p.role}`) : p.role,
      dept: isKnownRole(p.role) ? ROLE_DEPT[p.role] : 'top',
      checkIn: r?.check_in ?? '',
      checkOut: r?.check_out ?? '',
      status: r?.status ?? 'absent',
      note: r?.note ?? '',
    };
  });

  return <AttendanceView key={day} day={day} today={today} initialRows={rows} />;
}
