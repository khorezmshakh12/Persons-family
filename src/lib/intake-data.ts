import 'server-only';
import { sql } from '@/lib/db/client';
import { addDaysToKey, tashkentDayKey, tashkentMidnight, tashkentYmd } from '@/lib/time';
import { courseBalance, type CourseBalance, type SchedGroup } from '@/lib/ops-schedule';
import {
  alerts,
  cohorts,
  enrolledIn,
  funnel,
  heatmap,
  lostReasons,
  monthWindow,
  pace,
  sourceMatrix,
  type Alert,
  type Funnel,
  type LeadRow,
  type Pace,
  type Source,
  type SourceRow,
  type Window,
} from '@/lib/intake';

export type IntakeRange = 'week' | 'month' | 'quarter' | 'custom';

export type Intake = {
  range: IntakeRange;
  from: string; // day keys, `to` inclusive for display
  to: string;
  now: Funnel;
  prev: Funnel;
  enrolledInPeriod: number;
  trend: { label: string; leads: number; enrolled: number }[];
  sources: SourceRow[];
  courses: { course: string; leads: number; enrolled: number; balance: CourseBalance | null }[];
  heat: number[][];
  cohorts: ReturnType<typeof cohorts>;
  lost: { reason: string; n: number }[];
  leadPace: Pace;
  wonPace: Pace;
  monthSpend: Partial<Record<Source, number>>;
  month: string;
  alerts: Alert[];
  recent: (LeadRow & { name: string })[];
  campaigns: string[];
};

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

function windowFor(range: IntakeRange, today: string, from?: string, to?: string): { w: Window; fromKey: string; toKey: string } {
  let a: string;
  let b: string; // exclusive day key
  if (range === 'custom' && from && to && from <= to) {
    a = from;
    b = addDaysToKey(to, 1);
  } else if (range === 'week') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    a = addDaysToKey(today, -((dow + 6) % 7));
    b = addDaysToKey(a, 7);
  } else {
    const [y, m] = today.split('-').map(Number);
    const m0 = range === 'quarter' ? Math.floor((m - 1) / 3) * 3 + 1 : m;
    const span = range === 'quarter' ? 3 : 1;
    a = `${y}-${String(m0).padStart(2, '0')}-01`;
    const t = y * 12 + (m0 - 1) + span;
    b = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
  }
  return { w: { from: tashkentMidnight(a).toISOString(), to: tashkentMidnight(b).toISOString() }, fromKey: a, toKey: addDaysToKey(b, -1) };
}

export async function loadIntake(range: IntakeRange = 'month', fromKey?: string, toKey?: string): Promise<Intake> {
  const today = tashkentDayKey();
  const { w, fromKey: a, toKey: b } = windowFor(range, today, fromKey, toKey);
  const len = new Date(w.to).getTime() - new Date(w.from).getTime();
  const prevW: Window = { from: new Date(new Date(w.from).getTime() - len).toISOString(), to: w.from };

  const { year, month: mo, day } = tashkentYmd();
  const monthKey = `${year}-${String(mo).padStart(2, '0')}`;
  const daysInMonth = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  const cohortMonths = Array.from({ length: 6 }, (_, i) => {
    const t = year * 12 + (mo - 1) - (5 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  });
  const weekStart = (() => {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDaysToKey(today, -((dow + 6) % 7));
  })();
  const weeks: (Window & { label: string })[] = Array.from({ length: 8 }, (_, i) => {
    const s = addDaysToKey(weekStart, -7 * (7 - i));
    const [, mm, dd] = s.split('-').map(Number);
    return { from: tashkentMidnight(s).toISOString(), to: tashkentMidnight(addDaysToKey(s, 7)).toISOString(), label: `${dd} ${MONTHS[mm - 1]}` };
  });
  const earliest = [prevW.from, weeks[0].from, tashkentMidnight(`${cohortMonths[0]}-01`).toISOString()].sort()[0];
  const curMonth = monthWindow(monthKey, tashkentMidnight);
  const spendFrom = `${a.slice(0, 7)}-01`;

  const [rows, spendRows, monthSpendRows, tgtRow, groups, rooms, recent] = await Promise.all([
    sql<LeadRow[]>`
      select id, created_at, stage, source, course, campaign, lost_reason, trial_at, enrolled_at
      from ops_leads where created_at >= ${earliest} or enrolled_at >= ${earliest}`,
    sql<{ source: Source; amount: number }[]>`
      select source, sum(amount) as amount from lead_spend where month >= ${spendFrom} and month <= ${b} group by source`,
    sql<{ source: Source; amount: number }[]>`select source, amount from lead_spend where month = ${`${monthKey}-01`}`,
    sql<{ v: { leads?: number; won?: number } | null }[]>`select data #> array['tgt', ${monthKey}] as v from core_state where id = 1`,
    sql<SchedGroup[]>`
      select g.id, g.name, coalesce(g.course_name, '') as course, g.schedule_type as cohort,
        coalesce(g.configuration->>'time', '') as time, coalesce(trim(g.configuration->>'room'), '') as room,
        g.teacher_id, '' as teacher, coalesce((g.configuration->>'duration')::int, 90) as duration, e.enrolled
      from groups g left join ops_group_enrollment e on e.group_id = g.id`.catch(() => [] as SchedGroup[]),
    sql<{ code: string; capacity: number }[]>`select code, capacity from ops_rooms`.catch(() => [] as { code: string; capacity: number }[]),
    sql<(LeadRow & { name: string })[]>`
      select * from (
        select id, name, created_at, stage, source, course, campaign, lost_reason, trial_at, enrolled_at
        from ops_leads order by created_at desc limit 30
      ) x order by created_at desc`,
  ]);

  const spend = Object.fromEntries(spendRows.map((r) => [r.source, Number(r.amount)])) as Partial<Record<Source, number>>;
  const monthSpend = Object.fromEntries(monthSpendRows.map((r) => [r.source, Number(r.amount)])) as Partial<Record<Source, number>>;
  const now = funnel(rows, w);
  const prev = funnel(rows, prevW);
  const sources = sourceMatrix(rows, w, spend, weeks);

  const caps = new Map(rooms.map((r) => [r.code, r.capacity]));
  const recent90 = rows.filter((l) => new Date(l.created_at).getTime() >= Date.now() - 90 * 86_400_000);
  const balance = courseBalance(recent90, 3, groups, (room) => caps.get(room) ?? 0);
  const norm = (s: string) => s.trim().toLowerCase();
  const courseMap = new Map<string, { course: string; leads: number; enrolled: number }>();
  for (const l of rows) {
    if (new Date(l.created_at).getTime() < new Date(w.from).getTime() || new Date(l.created_at).getTime() >= new Date(w.to).getTime()) continue;
    const k = norm(l.course || '—');
    const c = courseMap.get(k) ?? { course: l.course.trim() || 'Kurs ko‘rsatilmagan', leads: 0, enrolled: 0 };
    c.leads++;
    if (l.enrolled_at || l.stage === 'enrolled') c.enrolled++;
    courseMap.set(k, c);
  }
  const courses = [...courseMap.entries()]
    .map(([k, c]) => ({ ...c, balance: balance.find((x) => norm(x.course) === k) ?? null }))
    .sort((x, y) => y.leads - x.leads);

  const tgt = tgtRow[0]?.v ?? {};
  const monthLeads = funnel(rows, curMonth).leads;
  const monthWon = enrolledIn(rows, curMonth);
  const leadPace = pace(monthLeads, Number(tgt.leads ?? 0), day, daysInMonth);
  const wonPace = pace(monthWon, Number(tgt.won ?? 0), day, daysInMonth);

  return {
    range,
    from: a,
    to: b,
    now,
    prev,
    enrolledInPeriod: enrolledIn(rows, w),
    trend: weeks.map((wk) => ({ label: wk.label, leads: funnel(rows, wk).leads, enrolled: enrolledIn(rows, wk) })),
    sources,
    courses,
    heat: heatmap(rows, w),
    cohorts: cohorts(rows, cohortMonths),
    lost: lostReasons(rows, w),
    leadPace,
    wonPace,
    monthSpend,
    month: monthKey,
    alerts: alerts(now, prev, sources, leadPace, wonPace),
    recent,
    campaigns: [...new Set(rows.map((r) => r.campaign).filter((c): c is string => !!c))].slice(0, 30),
  };
}
