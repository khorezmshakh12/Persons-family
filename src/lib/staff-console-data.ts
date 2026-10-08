import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import type { Profile } from '@/lib/auth/session';

/** One account row for the staff console — the full Profile (the edit
 * dialog needs it) plus what the console adds on top. */
export type ConsoleAccount = Profile & {
  avatarUrl: string | null;
  last_seen_at: string | null;
  positions: string[];
  overrides: { section: string; allow: boolean }[];
  market_editor: boolean;
};

export type AuditEntry = {
  id: string;
  at: string;
  type: string;
  description: string;
  actor: string | null;
  actor_id: string | null;
};

/** Account-related audit actions shown in the console's Jurnal tab. */
export const ACCOUNT_AUDIT_TYPES = [
  'staff.create',
  'staff.update',
  'staff.activate',
  'staff.deactivate',
  'staff.delete',
  'staff.password_reset',
  'staff.telegram_disconnect',
  'role_granted',
  'role_revoked',
  'section_access',
] as const;

export async function loadConsoleAccounts(isCeo: boolean): Promise<ConsoleAccount[]> {
  // Pay is CEO-only and must not even be selected for anyone else (the row
  // reaches the client-side edit dialog) — `0` keeps the type whole.
  const [rows, roles, overrides, editors] = await Promise.all([
    sql<(Profile & { last_seen_at: string | null })[]>`
      select id, first_name, last_name, phone, date_of_birth, role, avatar_url, is_active, created_at,
        created_by, must_change_password, telegram_id, teacher_level, level_updated_at, internship_level,
        email, address, emergency_contact, frozen_reason, last_seen_at,
        ${isCeo ? sql`monthly_salary` : sql`0 as monthly_salary`}
      from profiles order by first_name, last_name`,
    sql<{ user_id: string; role: string }[]>`select user_id, role::text as role from profile_roles`.catch(() => []),
    sql<{ user_id: string; section: string; allow: boolean }[]>`select user_id, section, allow from section_access`.catch(() => []),
    sql<{ user_id: string }[]>`select user_id from market_editors`.catch(() => []),
  ]);
  const editorSet = new Set(editors.map((e) => e.user_id));
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      avatarUrl: await resolveAvatarUrl(r.avatar_url),
      positions: roles.filter((x) => x.user_id === r.id && x.role !== r.role).map((x) => x.role),
      overrides: overrides.filter((o) => o.user_id === r.id).map((o) => ({ section: o.section, allow: o.allow })),
      market_editor: editorSet.has(r.id),
    })),
  );
}

export async function loadAccountAudit(limit = 300): Promise<AuditEntry[]> {
  try {
    return await sql<AuditEntry[]>`
      select row_number() over (order by l.created_at desc)::text as id, l.created_at as at, l.action_type as type,
        l.description, l.user_id as actor_id,
        case when p.id is null then null else p.first_name || ' ' || p.last_name end as actor
      from system_logs l left join profiles p on p.id = l.user_id
      where l.action_type in ${sql([...ACCOUNT_AUDIT_TYPES])}
      order by l.created_at desc
      limit ${limit}`;
  } catch {
    // created_at arrives with this round's migration; before that, no trail.
    return [];
  }
}
