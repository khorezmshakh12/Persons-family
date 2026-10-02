import { cache } from "react";
import { cookies } from "next/headers";
import { sql } from "@/lib/db/client";
import { getCurrentUser, revokeUserSessions } from "@/lib/gcp/session";
import type { StaffRole } from "@/lib/nav";
import type { TeacherLevel } from "@/lib/teacher-level";
import type { InternshipLevel } from "@/lib/internship-level";
import { isSessionRevoked } from "@/lib/auth/session-revocation";

export interface Profile {
  id: string;
  /** Chosen UI theme (lib/themes.ts); null/absent = Aurora. */
  ui_theme?: string | null;
  phone: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  avatar_url: string | null;
  role: StaffRole;
  is_active: boolean;
  must_change_password: boolean;
  created_by: string | null;
  created_at: string;
  telegram_id: number | null;
  teacher_level: TeacherLevel | null;
  level_updated_at: string | null;
  email: string | null;
  address: string | null;
  emergency_contact: string | null;
  internship_level: InternshipLevel | null;
  /** Editable monthly salary amount (numeric, parsed to a JS number by
   * db/client.ts). Defaults to 0; set from the Edit Staff dialog. */
  monthly_salary: number;
  /** null = never auto-frozen (this may still be a CEO's manual
   * deactivation — that path never sets this column). Non-null names which
   * automated flow froze the account, currently only 'star_balance' — see
   * freezeIfBalanceCritical in lib/stars-write.ts. */
  frozen_reason: string | null;
  /** Set by revokeUserSessions (lib/gcp/session.ts). Any session cookie
   * minted before this instant is treated as signed out. Optional because
   * it only exists once 20260923120000_profile_sessions_revoked_at.sql is
   * applied — until then the check below is simply skipped. */
  sessions_revoked_at?: string | null;
  /** Extra positions from profile_roles (raw, as loaded). */
  extra_roles?: string[];
  /** The stored profiles.role — `role` above is the ACTIVE position. */
  primary_role?: StaffRole;
  /** Every position this person holds (primary first). */
  roles?: StaffRole[];
  /** Per-person section overrides (Platform settings): section → open/closed. */
  section_overrides?: Record<string, boolean>;
}


/**
 * Authoritative, page-level auth check. The proxy already gates routes, but
 * Server Action redirects can transition client-side without re-running the
 * proxy — so every protected page/layout re-checks here too. A deactivated
 * staff member is treated as if they had no session at all.
 *
 * Wrapped in React's `cache()` because the (app) layout and nearly every
 * page under it each call this independently — without memoization that's
 * a Postgres round trip duplicated on every single navigation, on top of
 * the proxy already doing the same work. `cache()` dedupes those calls
 * within one request, so the whole tree shares a single lookup.
 */
export const getAuthState = cache(async function getAuthState() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, profile: null as Profile | null, suspended: false, frozenReason: null as string | null };
  }

  const [profile] = await sql<Profile[]>`
    select p.*, array(select r.role::text from profile_roles r where r.user_id = p.id order by r.role) as extra_roles,
      (select coalesce(jsonb_object_agg(a.section, a.allow), '{}'::jsonb) from section_access a where a.user_id = p.id) as section_overrides
    from profiles p where p.id = ${user.uid}
  `;

  if (profile && !profile.is_active) {
    await revokeUserSessions(user.uid);
    return { user: null, profile: null as Profile | null, suspended: true, frozenReason: profile.frozen_reason };
  }

  // Logged out elsewhere, password reset, role change… — see
  // revokeUserSessions. Treated exactly like having no session at all.
  if (profile && isSessionRevoked(user.issuedAt, profile.sessions_revoked_at)) {
    return { user: null, profile: null as Profile | null, suspended: false, frozenReason: null as string | null };
  }

  if (!profile) return { user, profile: null as Profile | null, suspended: false, frozenReason: null as string | null };

  // One person may hold several positions (profile_roles) and works in one
  // of them at a time — the "active role" picked in the header switcher
  // (cookie, re-validated against the DB here on every request, so a
  // revoked position stops working immediately). Everything downstream
  // reads `profile.role`, which is therefore the ACTIVE role; the stored
  // one stays in `primary_role`.
  const held = [profile.role, ...((profile.extra_roles ?? []) as StaffRole[]).filter((r) => r !== profile.role)];
  const wanted = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value as StaffRole | undefined;
  const active = wanted && held.includes(wanted) ? wanted : profile.role;
  return {
    user,
    profile: { ...profile, role: active, primary_role: profile.role, roles: held },
    suspended: false,
    frozenReason: null as string | null,
  };
});

export const ACTIVE_ROLE_COOKIE = 'persons_active_role';
