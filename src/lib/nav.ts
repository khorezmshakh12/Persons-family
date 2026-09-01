export type StaffRole =
  | 'ceo'
  | 'admin_manager'
  | 'teacher'
  | 'head_teacher'
  | 'assistant'
  | 'mmd'
  | 'internship'
  | 'it_developer';

export type NavItem = {
  key:
    | 'dashboard'
    | 'staff'
    | 'chat'
    | 'issues'
    | 'lessonPlans'
    | 'tasks'
    | 'companyNews'
    | 'telegramSetup'
    | 'selfDevelopment'
    | 'finance'
    | 'missions'
    | 'roadmap'
    | 'market'
    | 'analytics'
    | 'profile'
    | 'settings'
    | 'materials';
  href: string;
  roles?: StaffRole[];
  /** Points at a different app on the shared gateway (see
   * persons-staffs-gateway), not a route inside this Next.js app — must be
   * rendered as a plain `<a>`, never the i18n `Link`, since basePath/locale
   * prefixing would mangle the target. */
  external?: boolean;
};

/**
 * Who can see lesson plans at all. Exported (and reused as the nav entry's
 * own `roles` below, so the two can't drift) because the lesson-plan pages
 * have to re-check it server-side: this scoping used to come from the
 * groups/course_lessons RLS policies, which returned zero rows to every
 * other role, and with RLS gone a direct URL visit is otherwise ungated.
 */
// IT Developer was re-added here (view-only — see canEditLessonContent/
// canComment in lesson-plans/[groupId]/page.tsx, both false for this role)
// so it can see the same lesson-plan data the compliance bot is reporting on
// when investigating a report — it had been deliberately excluded ("IT
// Developer lost lesson-plan access entirely") in an earlier role rework.
export const LESSON_PLAN_ROLES: StaffRole[] = ['ceo', 'head_teacher', 'teacher', 'assistant', 'it_developer'];

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard' },
  // Goes through the SSO handoff route, not straight to /materials, so
  // clicking it doesn't drop the employee on Materials' login screen — see
  // src/app/api/sso/materials/route.ts.
  { key: 'materials', href: '/staff/api/sso/materials', external: true },
  // IT Developer regained staff (employee) management specifically — see
  // requireStaffManager() in lib/auth/require-admin.ts — but not the other
  // CEO-only areas (roadmap, telegram setup, deleting a staff account).
  { key: 'staff', href: '/staff', roles: ['ceo', 'it_developer'] },
  { key: 'chat', href: '/chat' },
  { key: 'issues', href: '/issues' },
  {
    key: 'lessonPlans',
    href: '/lesson-plans',
    // Head Teacher can see every teacher's lesson plans and comment on
    // them; IT Developer can see them too (view-only, re-added — see
    // LESSON_PLAN_ROLES' own comment) to investigate compliance-bot
    // reports. MMD ranks below teacher/assistant and never sees lesson
    // plans.
    roles: LESSON_PLAN_ROLES,
  },
  { key: 'tasks', href: '/tasks' },
  { key: 'companyNews', href: '/company-news' },
  { key: 'selfDevelopment', href: '/self-development' },
  { key: 'finance', href: '/finance' },
  { key: 'missions', href: '/missions' },
  // Roadmap (incl. its Monthly Goals section) is CEO/Administrative Manager
  // territory specifically — mirrors its table's RLS (an explicit
  // `current_role() in ('ceo','admin_manager')`, not the shared
  // is_admin()). IT Developer, now a plain regular employee, never has it.
  { key: 'roadmap', href: '/roadmap', roles: ['ceo', 'admin_manager'] },
  // Analytics (staff performance + roadmap-goals charts) — CEO-only, same as
  // the page's own `notFound()` gate. Had no nav entry at all, so it was
  // only reachable by typing the URL.
  { key: 'analytics', href: '/analytics', roles: ['ceo'] },
  // Persons Market — where an employee spends the stars they've accumulated.
  // No `roles`: everyone has a star balance, so everyone gets the shelf (the
  // CEO's curation controls live on the same page, gated inside it).
  { key: 'market', href: '/market' },
  { key: 'profile', href: '/profile' },
  { key: 'telegramSetup', href: '/telegram-setup', roles: ['ceo'] },
  { key: 'settings', href: '/settings' },
];

export function navItemsForRole(role: StaffRole, { materialsLinked = false }: { materialsLinked?: boolean } = {}) {
  return NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(role)) return false;
    // Only shown once this employee's phone number is matched to an
    // active Materials account (see checkMaterialsLink) — otherwise the
    // link would just dump them on Materials' login screen.
    if (item.key === 'materials' && !materialsLinked) return false;
    return true;
  });
}
