import { canSee, SECTION_ROLES, type Role, type SectionKey } from '@/lib/permissions';

/** The closed role set — defined (with every role's access) in lib/permissions.ts. */
export type StaffRole = Role;

export type NavItem = {
  key:
    | 'dashboard'
    | 'coreInbox'
    | 'sales'
    | 'hr'
    | 'report'
    | 'platform'
    | 'staff'
    | 'chat'
    | 'issues'
    | 'lessonPlans'
    | 'tasks'
    | 'companyNews'
    | 'telegramSetup'
    | 'selfDevelopment'
    | 'taskTracker'
    | 'finance'
    | 'roadmap'
    | 'market'
    | 'strategy'
    | 'accounting'
    | 'operations'
    | 'perforce'
    | 'profile'
    | 'settings'
    | 'materials'
    | 'kpi';
  href: string;
  /** Points at a different app on the shared gateway (see
   * persons-staffs-gateway), not a route inside this Next.js app — must be
   * rendered as a plain `<a>`, never the i18n `Link`, since basePath/locale
   * prefixing would mangle the target. */
  external?: boolean;
  /** Core v2 page this section shows; hidden unless it's in `coreViews`. */
  core?: string;
  /** Reached through another section's tabs, not listed in the sidebar. */
  folded?: boolean;
};

/** Sidebar section an item is listed under (v8-A, 2026-10-10: five groups
 * by how people use them). Purely presentational — visibility is still
 * decided by `roles` alone. */
export type NavGroup = 'daily' | 'me' | 'team' | 'manage' | 'system';

export const NAV_GROUP_ORDER: NavGroup[] = ['daily', 'me', 'team', 'manage', 'system'];

const NAV_GROUP: Record<NavItem['key'], NavGroup> = {
  // Kundalik — what everyone opens every day.
  dashboard: 'daily',
  tasks: 'daily',
  chat: 'daily',
  issues: 'daily',
  companyNews: 'daily',
  taskTracker: 'daily',
  coreInbox: 'daily',
  // Men — my own numbers and growth.
  kpi: 'me',
  selfDevelopment: 'me',
  profile: 'me',
  // Jamoa — people and the teaching floor.
  staff: 'team',
  hr: 'team',
  lessonPlans: 'team',
  operations: 'team',
  sales: 'team',
  materials: 'team',
  // Boshqaruv — direction, projects, numbers.
  strategy: 'manage',
  perforce: 'manage',
  report: 'manage',
  finance: 'manage',
  accounting: 'manage',
  roadmap: 'manage',
  // Tizim
  market: 'system',
  settings: 'system',
  platform: 'system',
  telegramSetup: 'system',
};

// Order inside each sidebar section.
const NAV_SORT: NavItem['key'][] = [
  'dashboard',
  'tasks',
  'chat',
  'issues',
  'companyNews',
  'taskTracker',
  'kpi',
  'selfDevelopment',
  'profile',
  'staff',
  'hr',
  'lessonPlans',
  'operations',
  'sales',
  'materials',
  'strategy',
  'perforce',
  'report',
  'finance',
  'accounting',
  'roadmap',
  'market',
  'settings',
  'platform',
  'telegramSetup',
  'coreInbox',
];

// Per-section audiences — derived from lib/permissions.ts (the single role
// matrix) and kept as named exports because page guards and actions import
// them. Edit SECTION_ROLES there, not these.
export const LESSON_PLAN_ROLES: StaffRole[] = [...SECTION_ROLES.lessonPlans];
export const STRATEGY_ROLES: StaffRole[] = [...SECTION_ROLES.strategy];
export const ACCOUNTING_ROLES: StaffRole[] = [...SECTION_ROLES.accounting];
export const OPERATIONS_ROLES: StaffRole[] = [...SECTION_ROLES.operations];
export const PERFORCE_ROLES: StaffRole[] = [...SECTION_ROLES.perforce];
export const MARKET_ROLES: StaffRole[] = [...SECTION_ROLES.market];

/** Who gets the first-visit intro and the new UI motion (nav/button/logo
 * micro-interactions) — the Strategy audience, per the owner. Everyone
 * else keeps the calm UI; the new logo itself is shown to all. */
export const MOTION_ROLES: StaffRole[] = STRATEGY_ROLES;

// Who sees each entry: SECTION_ROLES in lib/permissions.ts (checked by
// navItemsForRole below and by each page's own guard).
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard' },
  // Core v2 (the owner's Claude-designed workspace, src/core/core.html) is
  // spread over these sections, one Core page each, embedded 1:1. On top of
  // SECTION_ROLES, the CEO's per-person ACL in Core can narrow them — passed
  // in as `coreViews`, see coreViews() in lib/core-state.ts. (Inbox removed
  // by the owner 2026-10-05; /inbox now redirects to the Dashboard.)
  { key: 'sales', href: '/sales' },
  { key: 'hr', href: '/hr', core: 'hr' },
  { key: 'report', href: '/report' },
  { key: 'platform', href: '/platform', core: 'settings' },
  // Goes through the SSO handoff route, not straight to /materials, so
  // clicking it doesn't drop the employee on Materials' login screen — see
  // src/app/api/sso/materials/route.ts.
  { key: 'materials', href: '/staff/api/sso/materials', external: true },
  { key: 'staff', href: '/staff' },
  { key: 'chat', href: '/chat' },
  // Any staff member can report an issue and see the ones they raised;
  // managing the board is the 'issues.manage' capability.
  { key: 'issues', href: '/issues' },
  { key: 'lessonPlans', href: '/lesson-plans' },
  { key: 'tasks', href: '/tasks' },
  // Task Tracker: each employee's private weekly task/habit sheet (src/tracker).
  { key: 'taskTracker', href: '/task-tracker' },
  { key: 'companyNews', href: '/company-news' },
  { key: 'selfDevelopment', href: '/self-development' },
  { key: 'finance', href: '/finance' },
  { key: 'strategy', href: '/strategy' },
  // Folded into Finance (owner, 2026-10-05: one place for money) — opened
  // from the Finance page's «Hisob-kitob» tab, not the sidebar.
  { key: 'accounting', href: '/accounting', folded: true },
  { key: 'operations', href: '/operations' },
  { key: 'perforce', href: '/perforce' },
  // Persons Market — curation is the 'market.manage' capability.
  { key: 'market', href: '/market' },
  // My KPI: monthly plan in three scenarios, CEO approval + grading → salary.
  { key: 'kpi', href: '/my-kpi' },
  { key: 'profile', href: '/profile' },
  { key: 'telegramSetup', href: '/telegram-setup' },
  { key: 'settings', href: '/settings' },
];

export function navItemsForRole(
  role: StaffRole,
  { materialsLinked = false, coreViews = [] }: { materialsLinked?: boolean; coreViews?: string[] } = {},
) {
  return NAV_ITEMS.filter((item) => {
    // `coreViews` also carries per-person grants as 'grant:<nav key>' (e.g.
    // 'grant:market' for a market editor), opening an item beyond its roles.
    // Per-person overrides arrive as 'deny:<key>' (Platform settings).
    if (coreViews.includes(`deny:${item.key}`)) return false;
    if (item.key in SECTION_ROLES && !canSee(role, item.key as SectionKey) && !coreViews.includes(`grant:${item.key}`)) return false;
    // Only shown once this employee's phone number is matched to an
    // active Materials account (see checkMaterialsLink) — otherwise the
    // link would just dump them on Materials' login screen.
    if (item.key === 'materials' && !materialsLinked) return false;
    if (item.core && !coreViews.includes(item.core)) return false;
    return true;
  });
}

/** The role-filtered nav, bucketed into sidebar sections (empty sections
 * dropped). Same visibility rules as navItemsForRole — it's built on it. */
export function groupedNavItemsForRole(
  role: StaffRole,
  opts: { materialsLinked?: boolean; coreViews?: string[] } = {},
): { group: NavGroup; items: NavItem[] }[] {
  const items = [...navItemsForRole(role, opts)].filter((i) => !i.folded).sort((a, b) => NAV_SORT.indexOf(a.key) - NAV_SORT.indexOf(b.key));
  return NAV_GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => NAV_GROUP[i.key] === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Resolves the nav entry a pathname belongs to (for breadcrumbs). */
export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => !i.external && (pathname === i.href || pathname.startsWith(`${i.href}/`)));
}
