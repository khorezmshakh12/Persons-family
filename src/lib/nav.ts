export type StaffRole =
  | 'ceo'
  | 'admin_manager'
  | 'teacher'
  | 'head_teacher'
  | 'assistant'
  | 'mmd'
  | 'internship'
  | 'it_developer'
  | 'project_manager';

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
    | 'strategy'
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

/** Sidebar section an item is listed under (Persons Aurora layout). Purely
 * presentational — visibility is still decided by `roles` alone. */
export type NavGroup = 'main' | 'motivation' | 'workflow' | 'management';

export const NAV_GROUP_ORDER: NavGroup[] = ['main', 'motivation', 'workflow', 'management'];

const NAV_GROUP: Record<NavItem['key'], NavGroup> = {
  dashboard: 'main',
  tasks: 'main',
  finance: 'main',
  staff: 'main',
  market: 'motivation',
  missions: 'motivation',
  selfDevelopment: 'motivation',
  chat: 'workflow',
  issues: 'workflow',
  lessonPlans: 'workflow',
  companyNews: 'workflow',
  materials: 'workflow',
  strategy: 'management',
  analytics: 'management',
  roadmap: 'management',
  telegramSetup: 'management',
  profile: 'management',
  settings: 'management',
};

// Order inside each sidebar section — mirrors the Aurora reference.
const NAV_SORT: NavItem['key'][] = [
  'dashboard',
  'tasks',
  'finance',
  'staff',
  'market',
  'missions',
  'selfDevelopment',
  'chat',
  'issues',
  'lessonPlans',
  'companyNews',
  'materials',
  'strategy',
  'analytics',
  'roadmap',
  'telegramSetup',
  'profile',
  'settings',
];

/**
 * Who can see lesson plans at all. Exported (and reused as the nav entry's
 * own `roles` below, so the two can't drift) because the lesson-plan pages
 * have to re-check it server-side: this scoping used to come from the
 * groups/course_lessons RLS policies, which returned zero rows to every
 * other role, and with RLS gone a direct URL visit is otherwise ungated.
 */
// IT Developer is deliberately NOT here. It had been re-added at one point
// (view-only) so it could see the lesson-plan data the compliance bot
// reports on, but that has been reverted — the role is back to a plain
// regular employee with no lesson-plan reach at all, matching the earlier
// role rework ("IT Developer lost lesson-plan access entirely"). Removing
// it here hides the nav entry *and* makes lesson-plans/layout.tsx redirect
// a direct URL visit, since that guard reuses this same list.
export const LESSON_PLAN_ROLES: StaffRole[] = ['ceo', 'head_teacher', 'teacher', 'assistant'];

/** Strategy workspace (roadmap · mind map · board · list · gantt). Only
 * CEO, IT Developer and Project Manager (the role exists for exactly this
 * area) — per the owner's decision; Administrative Manager does NOT get it.
 * Reused by the page guard and every strategy.ts action. */
export const STRATEGY_ROLES: StaffRole[] = ['ceo', 'it_developer', 'project_manager'];

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
  // Any staff member can report an issue and see the ones they raised.
  // Managing the board — status changes, reassignment, deletion, the
  // resolution-stats panel — stays CEO-only; the /issues page and every
  // issues.ts Server Action enforce that themselves, independent of this
  // nav entry being ungated.
  { key: 'issues', href: '/issues' },
  {
    key: 'lessonPlans',
    href: '/lesson-plans',
    // Head Teacher can see every teacher's lesson plans and comment on
    // them. IT Developer does not (see LESSON_PLAN_ROLES' own comment), and
    // MMD ranks below teacher/assistant and never sees lesson plans either.
    // No local `roles` array on purpose: reusing LESSON_PLAN_ROLES keeps the
    // sidebar and the lesson-plans layout guard from drifting apart.
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
  { key: 'strategy', href: '/strategy', roles: STRATEGY_ROLES },
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

/** The role-filtered nav, bucketed into sidebar sections (empty sections
 * dropped). Same visibility rules as navItemsForRole — it's built on it. */
export function groupedNavItemsForRole(
  role: StaffRole,
  opts: { materialsLinked?: boolean } = {},
): { group: NavGroup; items: NavItem[] }[] {
  const items = [...navItemsForRole(role, opts)].sort((a, b) => NAV_SORT.indexOf(a.key) - NAV_SORT.indexOf(b.key));
  return NAV_GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => NAV_GROUP[i.key] === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Resolves the nav entry a pathname belongs to (for breadcrumbs). */
export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => !i.external && (pathname === i.href || pathname.startsWith(`${i.href}/`)));
}
