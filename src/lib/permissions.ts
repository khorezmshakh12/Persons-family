/**
 * Single source of truth for who may see and do what (owner's role model,
 * 2026-09-27). Pure data — safe to import from Server Components, Server
 * Actions, client components and tests alike.
 *
 * Three layers:
 *  - ROLES / ROLE_DEPT      — the closed role set and each role's department;
 *  - SECTION_ROLES          — which sidebar sections (pages) a role can open;
 *  - CAP_ROLES              — finer "may do X" capabilities inside a page;
 *  - MANAGES                — whose work a role leads (task assignment, team
 *                             data), i.e. the org chart below each manager.
 *
 * Every page guard, nav entry and Server Action gate reads these tables, so
 * changing a role's reach is a one-line edit here (tests/permissions.test.ts
 * pins the intended matrix).
 */

export const ROLES = [
  'ceo',
  'coo',
  'commercial_director',
  'academic_director',
  'financist',
  'operations_manager',
  'admin_manager',
  'sales_manager',
  'event_manager',
  'project_manager',
  'it_developer',
  'head_teacher',
  'teacher',
  'assistant',
  'mmd',
  'internship',
] as const;

export type Role = (typeof ROLES)[number];

export type Department = 'top' | 'com' | 'acad' | 'ops' | 'fin' | 'hr';

export const ROLE_DEPT: Record<Role, Department> = {
  ceo: 'top',
  coo: 'top',
  commercial_director: 'com',
  sales_manager: 'com',
  event_manager: 'com',
  mmd: 'com',
  academic_director: 'acad',
  head_teacher: 'acad',
  teacher: 'acad',
  assistant: 'acad',
  internship: 'acad',
  financist: 'fin',
  operations_manager: 'ops',
  admin_manager: 'hr',
  project_manager: 'ops',
  it_developer: 'ops',
};

const ALL: readonly Role[] = ROLES;
const LEADERSHIP: Role[] = ['ceo', 'coo'];

/** Roles each role leads — may assign/review their tasks and see team data.
 * Not transitive on purpose: the table lists the full reach explicitly. */
export const MANAGES: Record<Role, Role[]> = {
  ceo: ROLES.filter((r) => r !== 'ceo'),
  coo: ROLES.filter((r) => r !== 'ceo' && r !== 'coo'),
  commercial_director: ['sales_manager', 'event_manager', 'mmd'],
  academic_director: ['head_teacher', 'teacher', 'assistant', 'internship'],
  head_teacher: ['teacher', 'assistant', 'internship'],
  operations_manager: ['admin_manager', 'it_developer', 'project_manager'],
  project_manager: ['it_developer'],
  admin_manager: [],
  financist: [],
  sales_manager: [],
  event_manager: [],
  it_developer: [],
  teacher: [],
  assistant: [],
  mmd: [],
  internship: [],
};

export type SectionKey =
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
  | 'selfDevelopment'
  | 'finance'
  | 'market'
  | 'strategy'
  | 'accounting'
  | 'operations'
  | 'perforce'
  | 'telegramSetup'
  | 'profile'
  | 'settings'
  | 'materials';

export const SECTION_ROLES: Record<SectionKey, readonly Role[]> = {
  // Everyone — personal workspace.
  dashboard: ALL,
  coreInbox: ALL,
  tasks: ALL,
  chat: ALL,
  issues: ALL,
  companyNews: ALL,
  selfDevelopment: ALL,
  finance: ALL, // everyone sees their own pay; the all-staff table is a capability
  // Closed while the catalogue is prepared (owner, 2026-09-30); market
  // editors (market_editors table) get it as a per-person grant.
  market: ['ceo', 'coo', 'it_developer'],
  profile: ALL,
  settings: ALL,
  materials: ALL,
  hr: ALL, // own leave / vacation requests; other people's pay is redacted
  // Department sections.
  sales: [...LEADERSHIP, 'commercial_director', 'sales_manager', 'mmd', 'financist'],
  report: [...LEADERSHIP, 'commercial_director', 'academic_director', 'financist'],
  staff: [...LEADERSHIP, 'admin_manager', 'it_developer'],
  lessonPlans: ['ceo', 'academic_director', 'head_teacher', 'teacher', 'assistant'],
  strategy: [...LEADERSHIP, 'commercial_director', 'academic_director', 'operations_manager', 'project_manager', 'it_developer'],
  accounting: [...LEADERSHIP, 'financist'],
  operations: [
    ...LEADERSHIP,
    'operations_manager',
    'admin_manager',
    'commercial_director',
    'sales_manager',
    'academic_director',
    'event_manager',
    'project_manager',
    'it_developer',
  ],
  perforce: [...LEADERSHIP, 'operations_manager', 'project_manager', 'it_developer'],
  platform: ['ceo', 'coo', 'it_developer'],
  telegramSetup: ['ceo', 'coo', 'it_developer'],
};

export type Capability =
  | 'company.overview' // dashboard company-wide KPIs, all tasks/activity
  | 'staff.manage' // add/edit/freeze non-protected staff
  | 'staff.manageProtected' // CEO/COO/Admin-manager accounts, admin management
  | 'finance.viewAll' // everyone's salary, payroll
  | 'finance.manage' // salary entries, bonuses, deductions
  | 'stars.grant' // manual star awards / deductions
  | 'warnings.manage' // warnings, bonuses, punishments on profiles
  | 'contracts.manage'
  | 'kpi.manage'
  | 'selfDev.review' // rate monthly self-development reports
  | 'issues.manage' // the full issues board
  | 'news.publish' // company news + platform announcements
  | 'market.manage' // Persons Market catalogue + order decisions
  | 'academic.viewAll' // every group, lesson plan and calendar lesson
  | 'academic.manage' // groups & course lessons CRUD
  | 'chat.moderate' // DM anyone, mark DM importance
  | 'core.sales.edit' // Core leads / spend / targets
  | 'strategy.edit'
  | 'accounting.edit'
  | 'operations.edit'
  | 'perforce.edit';

export const CAP_ROLES: Record<Capability, readonly Role[]> = {
  'company.overview': LEADERSHIP,
  'staff.manage': [...LEADERSHIP, 'admin_manager', 'it_developer'],
  'staff.manageProtected': ['ceo'],
  'finance.viewAll': [...LEADERSHIP, 'financist'],
  'finance.manage': ['ceo', 'financist'],
  'stars.grant': LEADERSHIP,
  'warnings.manage': [...LEADERSHIP, 'admin_manager'],
  'contracts.manage': [...LEADERSHIP, 'admin_manager'],
  'kpi.manage': LEADERSHIP,
  'selfDev.review': [...LEADERSHIP, 'academic_director'],
  'issues.manage': [...LEADERSHIP, 'operations_manager', 'it_developer'],
  'news.publish': [...LEADERSHIP, 'admin_manager', 'event_manager', 'commercial_director'],
  'market.manage': [...LEADERSHIP, 'admin_manager'],
  'academic.viewAll': [...LEADERSHIP, 'academic_director', 'head_teacher'],
  'academic.manage': ['ceo', 'academic_director'],
  'chat.moderate': LEADERSHIP,
  'core.sales.edit': [...LEADERSHIP, 'commercial_director', 'sales_manager', 'mmd', 'financist'],
  'strategy.edit': SECTION_ROLES.strategy,
  'accounting.edit': ['ceo', 'financist'],
  'operations.edit': SECTION_ROLES.operations,
  'perforce.edit': SECTION_ROLES.perforce,
};

/** Accepts any string so a stale DB value (an old enum label) just fails closed. */
export function canSee(role: string | null | undefined, section: SectionKey): boolean {
  return !!role && (SECTION_ROLES[section] as readonly string[]).includes(role);
}

export function can(role: string | null | undefined, cap: Capability): boolean {
  return !!role && (CAP_ROLES[cap] as readonly string[]).includes(role);
}

/** Roles this role may assign tasks to (empty = may not assign at all). */
export function managedRoles(role: string | null | undefined): Role[] {
  return role && role in MANAGES ? MANAGES[role as Role] : [];
}

export function isKnownRole(role: string): role is Role {
  return (ROLES as readonly string[]).includes(role);
}

/** Roles only the CEO may grant, or manage the accounts of (edit, freeze,
 * reset password). Each of them carries leadership- or pay-level access,
 * so a staff manager (Admin Manager, IT Developer, COO) must not be able to
 * promote someone into one — e.g. into Financist to read everyone's pay. */
export const PROTECTED_ROLES: readonly Role[] = [
  'ceo',
  'coo',
  'commercial_director',
  'academic_director',
  'financist',
  'admin_manager',
];

export function isProtectedRole(role: string): boolean {
  return (PROTECTED_ROLES as readonly string[]).includes(role);
}

/** Who may grant / revoke extra positions (profile_roles) — decided on the
 * positions a person HOLDS, not the one they're currently working in, so a
 * CEO browsing as a teacher can still manage roles. Only a CEO touches the
 * CEO position itself (or the accounts of people holding it). */
export const ROLE_GRANTERS: readonly Role[] = ['ceo', 'coo'];

export function canAssignRoles(held: readonly string[] | null | undefined): boolean {
  return !!held && held.some((r) => (ROLE_GRANTERS as readonly string[]).includes(r));
}

export function canGrantRole(held: readonly string[] | null | undefined, role: string, targetHeld: readonly string[]): boolean {
  if (!canAssignRoles(held) || !isKnownRole(role)) return false;
  const actorIsCeo = !!held?.includes('ceo');
  if (role === 'ceo' || targetHeld.includes('ceo')) return actorIsCeo;
  return true;
}
