/**
 * The role model (lib/permissions.ts) against the owner-approved matrix,
 * plus the places that must enforce it: nav, page guards, Server Action
 * gates, task assignment and Core's per-viewer data redaction. Pure — no DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAP_ROLES,
  MANAGES,
  PROTECTED_ROLES,
  ROLES,
  SECTION_ROLES,
  can,
  canSee,
  type Role,
  type SectionKey,
} from '../src/lib/permissions';
import { navItemsForRole } from '../src/lib/nav';
import { allowedTaskAssigneeRoles } from '../src/lib/task-roles';
import { defaultBosses, redactForViewer } from '../src/lib/core-access';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// Sections every role opens (personal workspace).
const EVERYONE: SectionKey[] = [
  'dashboard', 'coreInbox', 'tasks', 'chat', 'issues', 'companyNews', 'selfDevelopment',
  'finance', 'profile', 'settings', 'materials', 'hr', 'butterfly',
];

// The owner-facing matrix: department sections per role, on top of EVERYONE.
const EXPECTED: Record<Role, SectionKey[]> = {
  // Owner, 2026-09-30: Market closed to all but CEO / COO / IT Developer;
  // monthly report removed; Strategy = CEO, COO, PM; Accounting = CEO only;
  // Platform settings = CEO, COO.
  ceo: ['sales', 'staff', 'lessonPlans', 'strategy', 'accounting', 'operations', 'perforce', 'platform', 'telegramSetup', 'market'],
  coo: ['sales', 'staff', 'strategy', 'operations', 'perforce', 'platform', 'telegramSetup', 'market'],
  commercial_director: ['sales', 'operations'],
  academic_director: ['lessonPlans', 'operations'],
  financist: ['sales'],
  operations_manager: ['operations', 'perforce'],
  admin_manager: ['staff', 'operations'],
  sales_manager: ['sales', 'operations'],
  event_manager: ['operations'],
  project_manager: ['strategy', 'operations', 'perforce'],
  it_developer: ['staff', 'operations', 'perforce', 'telegramSetup', 'market'],
  head_teacher: ['lessonPlans'],
  teacher: ['lessonPlans'],
  assistant: ['lessonPlans'],
  mmd: ['sales'],
  internship: [],
};

const ALL_SECTIONS = Object.keys(SECTION_ROLES) as SectionKey[];

test('section matrix matches the approved table for every role', () => {
  for (const role of ROLES) {
    const expected = new Set([...EVERYONE, ...EXPECTED[role]]);
    for (const s of ALL_SECTIONS) {
      assert.equal(canSee(role, s), expected.has(s), `${role} → ${s}`);
    }
  }
});

test('the sidebar shows exactly the sections a role may open', () => {
  // Core-backed entries also need the page in coreViews; give them all so
  // only SECTION_ROLES decides here (coreViews derives from the same table).
  const coreViews = ['inbox', 'sales', 'hr', 'report', 'settings'];
  for (const role of ROLES) {
    const keys = navItemsForRole(role, { materialsLinked: true, coreViews }).map((i) => i.key).sort();
    const expected = ALL_SECTIONS.filter((s) => canSee(role, s)).sort();
    assert.deepEqual(keys, expected, role);
  }
});

test('unknown / stale roles fail closed', () => {
  for (const s of ALL_SECTIONS) assert.equal(canSee('smm_mobilgrof', s), false);
  assert.equal(can(undefined, 'finance.viewAll'), false);
  assert.equal(can('', 'staff.manage'), false);
});

test("pay: only the CEO reads everyone's and changes it (owner, 2026-09-30)", () => {
  assert.deepEqual([...CAP_ROLES['finance.viewAll']], ['ceo']);
  assert.deepEqual([...CAP_ROLES['finance.manage']], ['ceo']);
  // Strategy › Moliya / Tahlil (company books, no per-person pay): CEO + COO (owner, 2026-10-04).
  assert.deepEqual([...CAP_ROLES['strategy.finance']], ['ceo', 'coo']);
});

test('every leadership / pay-level role is protected (only the CEO grants it)', () => {
  const powerful = new Set<string>([
    ...CAP_ROLES['finance.viewAll'],
    ...CAP_ROLES['company.overview'],
    ...CAP_ROLES['academic.manage'],
    ...CAP_ROLES['warnings.manage'],
  ]);
  for (const r of powerful) {
    if (r === 'it_developer') continue;
    assert.ok(PROTECTED_ROLES.includes(r as Role), `${r} must be in PROTECTED_ROLES`);
  }
  assert.deepEqual([...CAP_ROLES['staff.manageProtected']], ['ceo']);
});

test('org chart: nobody manages the CEO or themselves; leads only reach down', () => {
  for (const role of ROLES) {
    assert.ok(!MANAGES[role].includes('ceo'), role);
    assert.ok(!MANAGES[role].includes(role), role);
    assert.deepEqual(allowedTaskAssigneeRoles(role), MANAGES[role]);
  }
  assert.deepEqual(allowedTaskAssigneeRoles('commercial_director').sort(), ['event_manager', 'mmd', 'sales_manager']);
  assert.deepEqual(allowedTaskAssigneeRoles('head_teacher').sort(), ['assistant', 'internship', 'teacher']);
  assert.deepEqual(allowedTaskAssigneeRoles('teacher'), []);
  // A lead may never hand work to someone above them.
  assert.ok(!MANAGES.head_teacher.includes('academic_director'));
  assert.ok(!MANAGES.sales_manager.length);
});

test('default Core boss is the most specific manager present', () => {
  const rows = [
    { id: 'ceo', role: 'ceo', is_active: true },
    { id: 'coo', role: 'coo', is_active: true },
    { id: 'ad', role: 'academic_director', is_active: true },
    { id: 'ht', role: 'head_teacher', is_active: true },
    { id: 't1', role: 'teacher', is_active: true },
    { id: 'sm', role: 'sales_manager', is_active: true },
    { id: 'fin', role: 'financist', is_active: true },
  ];
  const b = defaultBosses(rows, 'ceo');
  assert.equal(b.t1, 'ht');
  assert.equal(b.ht, 'ad');
  assert.equal(b.ad, 'coo');
  assert.equal(b.sm, 'coo'); // no Commercial Director yet → COO
  assert.equal(b.coo, 'ceo');
  assert.equal(b.fin, 'coo');
});

// --- Core data boundary, per role ---------------------------------------

function fixture() {
  const staff = { me: { sal: 5_000_000 }, mate: { sal: 6_000_000 }, other: { sal: 9_000_000 } };
  const st: Record<string, unknown> = {
    leads: [{ at: 1, st: 'won', ch: 'ig' }],
    spend: { '2026-09': { ig: 1 } },
    tgt: {},
    bonus: { me: 1, mate: 2, other: 3 },
    kpi: { me: {}, mate: {}, other: {} },
    acl: { other: ['home'] },
    leave: [],
  };
  return { staff, st };
}

test('Core redaction: what each role actually receives', () => {
  for (const role of ROLES) {
    const { staff, st } = fixture();
    redactForViewer(role, 'me', new Set(['me', 'mate']), staff, st);
    const seesPay = can(role, 'finance.viewAll');
    assert.equal(staff.me.sal, 5_000_000, `${role} keeps own pay`);
    assert.equal(staff.other.sal > 0, seesPay, `${role} other pay`);
    const seesLeads = canSee(role, 'sales') || canSee(role, 'report');
    assert.equal('leads' in st, seesLeads, `${role} leads`);
    assert.equal('spend' in st, seesLeads, `${role} spend`);
    const wide = can(role, 'company.overview') || seesPay;
    assert.equal('other' in (st.bonus as object), wide, `${role} other's bonus`);
    assert.ok('mate' in (st.bonus as object), `${role} team bonus`);
    assert.equal('acl' in st, canSee(role, 'platform'), `${role} acl`);
    assert.ok('leave' in st, `${role} shared HR log`);
  }
});

// --- Enforcement points ----------------------------------------------------

test('every restricted page guards with the matrix', () => {
  const app = 'src/app/[locale]/(app)/';
  const guards: [string, RegExp][] = [
    // canSeeFor = the role matrix plus Platform-settings per-person overrides.
    [`${app}staff/layout.tsx`, /canSeeFor\(profile, 'staff'\)/],
    [`${app}telegram-setup/layout.tsx`, /canSeeFor\(profile, 'telegramSetup'\)/],
    [`${app}lesson-plans/layout.tsx`, /canSeeFor\(profile, 'lessonPlans'\)/],
    [`${app}strategy/page.tsx`, /canSeeFor\(profile, 'strategy'\)/],
    [`${app}accounting/page.tsx`, /canSeeFor\(profile, 'accounting'\)/],
    [`${app}operations/page.tsx`, /canSeeFor\(profile, 'operations'\)/],
    [`${app}perforce/page.tsx`, /canSeeFor\(profile, 'perforce'\)/],
    [`${app}market/page.tsx`, /canSeeFor\(profile, 'market'\)/],
    ['src/components/core/core-section.tsx', /coreViews\(profile!?\)\)\.includes\(view\)/],
    ['src/app/api/core/app/route.ts', /coreViews\(profile\)\)\.includes\(view\)/],
  ];
  for (const [file, re] of guards) assert.match(read(file), re, file);
});

test('workspace Server Actions gate on their own capability', () => {
  const gates: [string, string][] = [
    ['strategy.ts', "requireCap('strategy.edit')"],
    // Finance inputs default to strategy.finance (CEO, COO); node links stay on strategy.edit.
    ['strategy-finance.ts', "cap: 'strategy.edit' | 'strategy.finance' = 'strategy.finance'"],
    ['operations.ts', "requireCap('operations.edit')"],
    ['perforce.ts', "requireCap('perforce.edit')"],
    ['accounting.ts', "cap: 'accounting.edit' | 'strategy.finance' = 'accounting.edit'"],
    ['finance.ts', "requireCap('finance.manage')"],
    ['contracts.ts', "requireCap('contracts.manage')"],
    ['market.ts', "requireCap('market.manage')"],
    ['issues.ts', "requireCap('issues.manage')"],
    ['warnings.ts', "requireCap('warnings.manage')"],
    ['kpi.ts', "requireCap('kpi.manage')"],
    ['stars.ts', "requireCap('stars.grant')"],
    ['company-news.ts', "requireCap('news.publish')"],
  ];
  for (const [file, gate] of gates) {
    const src = read(`src/lib/actions/${file}`);
    assert.ok(src.includes(gate), `${file} must call ${gate}`);
    assert.ok(!src.includes('requireStrategyEditor('), `${file} still uses the old Strategy-only gate`);
  }
});

test('no page or action still hard-codes the CEO for a delegated capability', () => {
  const files = [
    ...readdirSync(join(root, 'src/lib/actions')).map((f) => `src/lib/actions/${f}`),
  ].filter((f) => f.endsWith('.ts'));
  // Actions that legitimately stay CEO-only (managing CEO/Admin accounts).
  const ceoOnly = new Set(['src/lib/actions/admin-management.ts', 'src/lib/actions/staff.ts']);
  for (const f of files) {
    if (ceoOnly.has(f)) continue;
    const src = read(f);
    assert.ok(!/requireAdmin\(\)/.test(src), `${f}: requireAdmin() — use requireCap()`);
    // (`row.role === 'ceo'` labels a comment author — display, not a gate.)
    assert.ok(!/(profile\??|me|viewer)\.role (===|!==) 'ceo'/.test(src), `${f}: role === 'ceo' — use can()`);
  }
});

// --- Roles exist everywhere they must -------------------------------------

// staff_role predates this repo's migrations (original Supabase schema).
const BASE_ENUM = ['ceo', 'admin_manager', 'teacher', 'head_teacher', 'assistant', 'internship', 'it_developer'];

test('every role exists in the DB enum migrations', () => {
  const dir = join(root, 'supabase/migrations');
  const sqlText = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  for (const role of ROLES) {
    const added = new RegExp(`add value if not exists '${role}'`).test(sqlText);
    assert.ok(added || BASE_ENUM.includes(role), `staff_role enum is missing '${role}'`);
  }
});

test('every role has a label in uz / en / ru', () => {
  for (const lang of ['uz', 'en', 'ru']) {
    const roles = JSON.parse(read(`messages/${lang}.json`)).staff.roles as Record<string, string>;
    for (const role of ROLES) assert.ok(roles[role]?.trim(), `${lang}: staff.roles.${role}`);
  }
});
