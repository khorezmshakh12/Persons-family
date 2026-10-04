/** My KPI — shared (client + server) types, role templates and deadlines. */
import type { Role } from '@/lib/permissions';

export type Scenario = 'bad' | 'good' | 'great';
export const SCENARIOS: Scenario[] = ['bad', 'good', 'great'];
export const SCENARIO_LABEL: Record<Scenario, string> = { bad: 'Yomon', good: 'Yaxshi', great: 'Juda yaxshi' };
export const SCENARIO_HINT: Record<Scenario, string> = {
  bad: 'Minimal natija — eng kamida shu',
  good: 'Rejadagi natija — kutilgan daraja',
  great: 'Stretch — kuchli oy bo‘lsa',
};

export type KpiItemKind = 'number' | 'money' | 'percent' | 'projects' | 'text';
export const KIND_LABEL: Record<KpiItemKind, string> = {
  number: 'Son',
  money: 'Summa',
  percent: 'Foiz',
  projects: 'Loyihalar',
  text: 'Matn',
};

export type KpiItem = {
  id?: string;
  title: string;
  kind: KpiItemKind;
  unit: string;
  target_bad: string;
  target_good: string;
  target_great: string;
  actual: string;
};

export type KpiStatus = 'draft' | 'submitted' | 'returned' | 'approved';
export const STATUS_LABEL: Record<KpiStatus, string> = {
  draft: 'Qoralama',
  submitted: 'Tasdiq kutilmoqda',
  returned: 'Qaytarildi',
  approved: 'Tasdiqlangan',
};

export type KpiPlan = {
  id: string;
  user_id: string;
  month: string; // YYYY-MM-01
  status: KpiStatus;
  scenarios: Partial<Record<Scenario, { summary: string }>>;
  submitted_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  pct_bad: number;
  pct_good: number;
  pct_great: number;
  self_result: Scenario | null;
  self_note: string | null;
  grade: Scenario | null;
  grade_pct: number | null;
  grade_amount: number | null;
  grade_note: string | null;
  graded_at: string | null;
  items: KpiItem[];
};

/** Template rows a role starts from — the employee edits, adds or removes. */
type Tpl = Pick<KpiItem, 'title' | 'kind' | 'unit'>;
const SALES: Tpl[] = [
  { title: 'Sotuvlar soni (yangi o‘quvchilar)', kind: 'number', unit: 'ta' },
  { title: 'Sotuv summasi', kind: 'money', unit: 'mln so‘m' },
  { title: 'Lid → o‘quvchi konversiyasi', kind: 'percent', unit: '%' },
];
const MARKETING: Tpl[] = [
  { title: 'Yangi lidlar', kind: 'number', unit: 'ta' },
  { title: 'Bir lid narxi (CPL)', kind: 'money', unit: 'ming so‘m' },
  { title: 'Kontent (post / reels)', kind: 'number', unit: 'ta' },
];
const TEACHER: Tpl[] = [
  { title: 'O‘quvchilarni saqlab qolish', kind: 'percent', unit: '%' },
  { title: 'Mock / imtihon o‘rtacha natijasi', kind: 'number', unit: 'ball' },
  { title: 'Dars rejalari o‘z vaqtida', kind: 'percent', unit: '%' },
];
const IT: Tpl[] = [
  { title: 'Tugatiladigan loyihalar (nomi bilan)', kind: 'projects', unit: 'ta' },
  { title: 'Yopilgan buglar / muammolar', kind: 'number', unit: 'ta' },
];
const MANAGER: Tpl[] = [
  { title: 'Bo‘lim asosiy ko‘rsatkichi', kind: 'number', unit: '' },
  { title: 'Muhim loyihalar / tashabbuslar', kind: 'projects', unit: 'ta' },
  { title: 'Jamoa vazifalari bajarilishi', kind: 'percent', unit: '%' },
];
const FINANCE: Tpl[] = [
  { title: 'Qarzdorlik undirilishi', kind: 'money', unit: 'mln so‘m' },
  { title: 'Hisobotlar o‘z vaqtida', kind: 'percent', unit: '%' },
];
const EVENTS: Tpl[] = [
  { title: 'O‘tkaziladigan tadbirlar (nomi bilan)', kind: 'projects', unit: 'ta' },
  { title: 'Tadbir qatnashchilari', kind: 'number', unit: 'kishi' },
];
const GENERAL: Tpl[] = [
  { title: 'Asosiy natija', kind: 'number', unit: '' },
  { title: 'Bajariladigan ishlar', kind: 'projects', unit: 'ta' },
];

export const KPI_TEMPLATES: Record<Role, Tpl[]> = {
  ceo: GENERAL,
  coo: MANAGER,
  commercial_director: [...SALES.slice(1), ...MANAGER.slice(1)],
  academic_director: [...TEACHER.slice(0, 2), ...MANAGER.slice(1)],
  financist: FINANCE,
  operations_manager: MANAGER,
  admin_manager: MANAGER,
  sales_manager: SALES,
  event_manager: EVENTS,
  project_manager: [{ title: 'Yopiladigan loyihalar (nomi bilan)', kind: 'projects', unit: 'ta' }, ...MANAGER.slice(2)],
  it_developer: IT,
  head_teacher: TEACHER,
  teacher: TEACHER,
  assistant: TEACHER.slice(0, 2),
  mmd: MARKETING,
  internship: GENERAL,
};

export const emptyItem = (t?: Tpl): KpiItem => ({
  title: t?.title ?? '',
  kind: t?.kind ?? 'number',
  unit: t?.unit ?? '',
  target_bad: '',
  target_good: '',
  target_great: '',
  actual: '',
});

/* ---------- months & deadlines (Tashkent) ---------- */

/** YYYY-MM-01 of the month `offset` months from `ym01`. */
export function shiftMonth(ym01: string, offset: number): string {
  const [y, m] = ym01.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** A plan for `month` is due by the last day of the month before, 23:59 Tashkent. */
export function deadlineOf(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  // 00:00 Tashkent on the 1st of `month` = 19:00 UTC the day before; minus one minute.
  return new Date(Date.UTC(y, m - 1, 1) - 5 * 3600_000 - 60_000);
}

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function isLate(plan: Pick<KpiPlan, 'month' | 'submitted_at'>, now = new Date()): boolean {
  const due = deadlineOf(plan.month);
  return plan.submitted_at ? new Date(plan.submitted_at) > due : now > due;
}

export function pctFor(plan: Pick<KpiPlan, 'pct_bad' | 'pct_good' | 'pct_great'>, s: Scenario): number {
  return s === 'bad' ? plan.pct_bad : s === 'good' ? plan.pct_good : plan.pct_great;
}
