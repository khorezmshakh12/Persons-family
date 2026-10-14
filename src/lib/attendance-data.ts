import 'server-only';
import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { isKnownRole, ROLE_DEPT } from '@/lib/permissions';
import type { AttendanceStatus } from '@/lib/attendance';
import type { AttendanceRow } from '@/components/attendance/attendance-view';

/** Every active employee with their attendance for one Tashkent day
 * (no row yet = "Kelmadi"). Staff come from profiles only. */
export async function loadAttendanceRows(day: string): Promise<AttendanceRow[]> {
  const t = await getTranslations('staff');
  const [people, records] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
      select id, first_name, last_name, role from profiles
      where is_active order by first_name, last_name`,
    sql<{ profile_id: string; check_in: string | null; check_out: string | null; status: AttendanceStatus; note: string }[]>`
      select profile_id, check_in, check_out, status, note from staff_attendance where day = ${day}`,
  ]);
  const byId = new Map(records.map((r) => [r.profile_id, r]));

  return people.map((p) => {
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
}
