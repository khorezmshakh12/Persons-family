/**
 * Operation HQ › Statistika › Markaz holati (2026-10-28) — pure, no DB.
 * Every figure is a count or a sum of real rows; nothing is estimated or
 * scored. Tested in tests/ops-health.test.ts.
 *
 * Faol on a day D: activated on or before D (first real payment, or the
 * «paid in another CRM» mark), not archived by D, a monthly fee set and not
 * frozen. Fee and frozen are today's values (their history is not kept), so
 * for today this is exactly the O'quvchilar faol rule.
 */

import { addDaysToKey } from './time';

export type HealthStudent = {
  id: string;
  name: string;
  status: 'active' | 'frozen' | 'archived';
  /** Tashkent day the student was created. */
  created: string;
  /** First real payment or the paid-elsewhere mark (day), or null. */
  activated: string | null;
  /** Tashkent day archived, or null. */
  left: string | null;
  leaveReason: string;
  /** Monthly fee after discount. */
  fee: number;
  balance: number;
  hasParentPhone: boolean;
  inGroup: boolean;
};
export type HealthLead = { created: string; source: string; trial: boolean; studentId: string | null; lostReason: string };
export type HealthGroup = { name: string; limit: number; students: number };

export type HealthInput = {
  /** 'YYYY-MM-01' of the month shown. */
  month: string;
  today: string;
  students: HealthStudent[];
  leads: HealthLead[];
  groups: HealthGroup[];
  /** Net collected per month ('YYYY-MM-01' → so'm). */
  collected: Record<string, number>;
  attendance: { present: number; marked: number };
  /** All-time net paid by students who ever paid, and how many they are. */
  paidAllTime: { total: number; students: number };
};

export type NameItem = { id: string; name: string; note?: string };

export type Health = {
  month: string;
  /** Last day counted: the month's end, or today for the running month. */
  to: string;
  students: {
    activeStart: number;
    activeEnd: number;
    newActive: NameItem[];
    left: NameItem[];
    /** Left among those who were faol: churn = this / activeStart. */
    leftActive: number;
    churnPct: number | null;
    waiting: NameItem[];
    frozen: NameItem[];
    /** Average months studied by students who left in the last 12 months. */
    avgMonths: number | null;
    /** Net paid per student who ever paid (all time). */
    avgRevenue: number | null;
    attendancePct: number | null;
  };
  money: {
    expected: number;
    collected: number;
    collectedPct: number | null;
    debt: number;
    debtors: NameItem[];
    /** Owes more than one monthly fee. */
    bigDebtors: number;
    forecast: number;
  };
  funnel: {
    leads: number;
    trial: number;
    converted: number;
    paid: number;
    avgDays: number | null;
    sources: { source: string; leads: number; paid: number }[];
    lost: { reason: string; n: number }[];
  };
  /** Six months ending with the shown one. */
  trend: { month: string; active: number; collected: number }[];
  groups: HealthGroup[];
  /** Activation month → share still studying k months later (k = 1..4). */
  cohorts: { month: string; n: number; kept: (number | null)[] }[];
  gaps: { key: string; label: string; items: NameItem[] }[];
};

/** 'YYYY-MM-01' ± n months. */
export function shiftMonthKey(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

/** Last day of the month of a 'YYYY-MM-01' key. */
export function monthEnd(month: string): string {
  return addDaysToKey(shiftMonthKey(month, 1), -1);
}

/** A day key plus whole months, clamped to the target month's last day. */
export function addMonthsToDay(day: string, n: number): string {
  const m = shiftMonthKey(`${day.slice(0, 7)}-01`, n);
  const end = monthEnd(m);
  const want = `${m.slice(0, 8)}${day.slice(8, 10)}`;
  return want > end ? end : want;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function activeOn(s: HealthStudent, day: string): boolean {
  return !!s.activated && s.activated <= day && (!s.left || s.left > day) && s.fee > 0 && s.status !== 'frozen';
}

export function computeHealth(input: HealthInput): Health {
  const { month, today, students } = input;
  const end = monthEnd(month);
  const to = end < today ? end : today;
  const before = addDaysToKey(month, -1);
  const inMonth = (d: string | null) => !!d && d >= month && d <= to;
  const item = (s: HealthStudent, note?: string): NameItem => ({ id: s.id, name: s.name, ...(note ? { note } : {}) });
  const live = students.filter((s) => !s.left);

  const activeStart = students.filter((s) => activeOn(s, before)).length;
  const activeEndList = students.filter((s) => activeOn(s, to));
  const left = students.filter((s) => inMonth(s.left));
  const leftActive = left.filter((s) => s.activated && s.activated <= s.left!).length;
  const yearAgo = addDaysToKey(today, -365);
  const stayed = students.filter((s) => s.left && s.activated && s.left >= yearAgo && s.activated <= s.left).map((s) => days(s.activated!, s.left!) / 30.4);

  const debtors = live.filter((s) => s.balance < 0).sort((a, b) => a.balance - b.balance);
  const waiting = live.filter((s) => s.status === 'active' && s.fee > 0 && !s.activated);
  const nowActive = live.filter((s) => activeOn(s, today));

  const leads = input.leads.filter((l) => inMonth(l.created));
  const byId = new Map(students.map((s) => [s.id, s]));
  const paidLead = (l: HealthLead) => !!l.studentId && !!byId.get(l.studentId)?.activated;
  const leadDays = leads.flatMap((l) => {
    const s = l.studentId ? byId.get(l.studentId) : undefined;
    return s?.activated && s.activated >= l.created ? [days(l.created, s.activated)] : [];
  });
  const sources = new Map<string, { leads: number; paid: number }>();
  for (const l of leads) {
    const v = sources.get(l.source) ?? { leads: 0, paid: 0 };
    v.leads += 1;
    if (paidLead(l)) v.paid += 1;
    sources.set(l.source, v);
  }
  const lost = new Map<string, number>();
  for (const l of leads) if (l.lostReason) lost.set(l.lostReason, (lost.get(l.lostReason) ?? 0) + 1);

  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonthKey(month, i - 5);
    const e = monthEnd(m) < today ? monthEnd(m) : today;
    return { month: m, active: m > today ? 0 : students.filter((s) => activeOn(s, e)).length, collected: input.collected[m] ?? 0 };
  });

  const cohorts = Array.from({ length: 6 }, (_, i) => shiftMonthKey(month, i - 5)).map((m) => {
    const group = students.filter((s) => s.activated && s.activated >= m && s.activated <= monthEnd(m));
    const kept = [1, 2, 3, 4].map((k) => {
      if (!group.length) return null;
      const reached = group.filter((s) => addMonthsToDay(s.activated!, k) <= today);
      if (reached.length < group.length) return null;
      return pct(group.filter((s) => !s.left || s.left > addMonthsToDay(s.activated!, k)).length, group.length);
    });
    return { month: m, n: group.length, kept };
  });

  const expected = activeEndList.reduce((a, s) => a + s.fee, 0);
  const collected = input.collected[month] ?? 0;
  return {
    month,
    to,
    students: {
      activeStart,
      activeEnd: activeEndList.length,
      newActive: students.filter((s) => inMonth(s.activated)).map((s) => item(s)),
      left: left.map((s) => item(s, s.leaveReason || 'sababsiz')),
      leftActive,
      churnPct: activeStart ? Math.round((leftActive / activeStart) * 1000) / 10 : null,
      waiting: waiting.map((s) => item(s)),
      frozen: live.filter((s) => s.status === 'frozen').map((s) => item(s)),
      avgMonths: stayed.length ? Math.round((stayed.reduce((a, b) => a + b, 0) / stayed.length) * 10) / 10 : null,
      avgRevenue: input.paidAllTime.students ? Math.round(input.paidAllTime.total / input.paidAllTime.students) : null,
      attendancePct: pct(input.attendance.present, input.attendance.marked),
    },
    money: {
      expected,
      collected,
      collectedPct: pct(collected, expected),
      debt: debtors.reduce((a, s) => a - s.balance, 0),
      debtors: debtors.map((s) => item(s, `${Math.round(-s.balance).toLocaleString('en-US')} so‘m`)),
      bigDebtors: debtors.filter((s) => s.fee > 0 && -s.balance > s.fee).length,
      forecast: nowActive.reduce((a, s) => a + s.fee, 0) + waiting.reduce((a, s) => a + s.fee, 0),
    },
    funnel: {
      leads: leads.length,
      trial: leads.filter((l) => l.trial).length,
      converted: leads.filter((l) => l.studentId).length,
      paid: leads.filter(paidLead).length,
      avgDays: leadDays.length ? Math.round((leadDays.reduce((a, b) => a + b, 0) / leadDays.length) * 10) / 10 : null,
      sources: [...sources].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.leads - a.leads),
      lost: [...lost].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    },
    trend,
    groups: [...input.groups].sort((a, b) => b.students / Math.max(1, b.limit) - a.students / Math.max(1, a.limit)),
    cohorts,
    gaps: [
      { key: 'parent', label: 'Ota yoki ona telefoni yo‘q', items: live.filter((s) => !s.hasParentPhone).map((s) => item(s)) },
      { key: 'group', label: 'Guruhga biriktirilmagan', items: live.filter((s) => s.status !== 'frozen' && !s.inGroup).map((s) => item(s)) },
      { key: 'fee', label: 'Oylik to‘lov summasi yo‘q', items: live.filter((s) => s.status === 'active' && s.fee <= 0).map((s) => item(s)) },
      { key: 'reason', label: 'Arxivda, lekin sababi yo‘q', items: students.filter((s) => s.left && !s.leaveReason).map((s) => item(s)) },
    ],
  } satisfies Health;
}

