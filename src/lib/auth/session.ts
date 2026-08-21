import { cache } from "react";
import { sql } from "@/lib/db/client";
import { getCurrentUser, revokeUserSessions } from "@/lib/gcp/session";
import type { StaffRole } from "@/lib/nav";
import type { TeacherLevel } from "@/lib/teacher-level";
import type { InternshipLevel } from "@/lib/internship-level";

export interface Profile {
  id: string;
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
  if (!user) return { user: null, profile: null as Profile | null, suspended: false };

  const [profile] = await sql<Profile[]>`select * from profiles where id = ${user.uid}`;

  if (profile && !profile.is_active) {
    await revokeUserSessions(user.uid);
    return { user: null, profile: null as Profile | null, suspended: true };
  }

  return { user, profile: profile ?? null, suspended: false };
});
