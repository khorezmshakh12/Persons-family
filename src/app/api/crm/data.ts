import 'server-only';
import { sql } from '@/lib/db/client';

// Jonli bazadan (crm_* jadvallar) CRM sahifasi kutadigan `window.CRM` shaklini
// quradi. Shakl build_data.py bilan bir xil — UI o'zgarmaydi, faqat manba
// endi statik nusxa emas, baza. Barcha id'lar baza uuid'lari (students.id =
// payments.sid = attendance.sid; groups.id = enrollment.gid = attendance.gid).

const d10 = (s: unknown) => (s ? String(s).slice(0, 10) : '');
const num = (n: unknown) => Number(n) || 0;

// Toshkent oyi / kuni — eslint man etgan getMonth/getDate'siz (Intl orqali).
function tashkent(fmt: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', ...fmt }).format(new Date());
}

type Row = Record<string, string | number | boolean | null>;

export async function loadCrmData() {
  const [students, contacts, enrollments, groups, teachers, payments, expenses, leads, sections, attendance, staff, acct, settings, postedRows, archStudents, archGroups, crmCourses, announcements, behaviours, rooms, exams] =
    await Promise.all([
      sql<Row[]>`select id, full_name, sex, birthday, scores, coins, balance, status, note from crm_students where archived_at is null`,
      sql<Row[]>`select student_id, kind, phone, is_primary from crm_contacts`,
      sql<Row[]>`
        select e.student_id, e.group_id, e.tariff_amount, e.status, e.activation_date,
               g.name as gname, g.days, c.name as course, t.display_name as teacher
        from crm_enrollments e
        join crm_groups g on g.id = e.group_id
        left join crm_courses c on c.id = g.course_id
        left join crm_teachers t on t.id = g.head_teacher_id`,
      sql<Row[]>`
        select g.id, g.name, g.days, g.start_date, g.end_date, g.student_limit, g.head_teacher_id,
               c.name as course, t.display_name as teacher, r.name as room
        from crm_groups g
        left join crm_courses c on c.id = g.course_id
        left join crm_teachers t on t.id = g.head_teacher_id
        left join crm_rooms r on r.id = g.room_id
        where g.archived_at is null`,
      sql<Row[]>`
        select t.id, t.display_name, t.profile_id, p.first_name, p.last_name
        from crm_teachers t left join profiles p on p.id = t.profile_id
        where t.archived_at is null`,
      sql<Row[]>`
        select p.id, p.paid_at, p.amount, p.method, p.student_id, s.full_name as sn,
               p.group_name, p.is_refund, p.refund_amount
        from crm_payments p left join crm_students s on s.id = p.student_id
        order by p.paid_at desc`,
      sql<Row[]>`select id, spent_at, amount, category, note from crm_expenses order by spent_at desc`,
      sql<Row[]>`
        select l.id, l.name, l.phone, l.section_id, c.name as course, l.note, l.source, l.created_at, l.converted_student_id
        from crm_leads l left join crm_courses c on c.id = l.course_id`,
      sql<Row[]>`select id, name from crm_lead_sections where archived_at is null order by sort`,
      sql<Row[]>`select student_id, group_id, att_date, present, is_late from crm_attendance`,
      sql<Row[]>`select id, first_name, last_name, role from profiles where is_active = true order by first_name, last_name`,
      sql<Row[]>`select code, name, type from acct_accounts where type in ('R', 'A') order by type, sort, code`,
      sql<Row[]>`select income_acct, cash_acct, center_name, cycle_days, late_after_minutes, currency from crm_settings where id = true`,
      sql<Row[]>`select count(*)::int as c from acct_entries where source like 'crm-pay:%'`,
      sql<Row[]>`select id, full_name, archived_at, leave_reason from crm_students where archived_at is not null order by archived_at desc limit 200`,
      sql<Row[]>`select id, name from crm_groups where archived_at is not null order by archived_at desc limit 200`,
      sql<Row[]>`select id, name from crm_courses where archived_at is null`,
      sql<Row[]>`select id, title, body, created_at from crm_announcements where archived_at is null order by created_at desc limit 50`,
      sql<Row[]>`select id, student_id, kind, points, note, created_at from crm_behaviours order by created_at desc limit 1000`,
      sql<Row[]>`select id, name, capacity from crm_rooms where archived_at is null order by name`,
      sql<Row[]>`select e.id, e.student_id, s.full_name as sn, e.group_name, e.name, e.exam_date, e.score, e.max_score, e.passed, e.cert, e.note from crm_exams e left join crm_students s on s.id = e.student_id order by e.exam_date desc nulls last, e.created_at desc limit 1000`,
    ]);

  // --- aloqa: telefon (tel) + ota-ona (ptel) ---
  const telOf = new Map<string, string>();
  const ptelOf = new Map<string, string>();
  for (const c of contacts) {
    const sid = String(c.student_id);
    if (c.kind === 'guardian') {
      if (c.phone && !ptelOf.has(sid)) ptelOf.set(sid, String(c.phone));
    } else if (c.phone && (c.is_primary || !telOf.has(sid))) {
      telOf.set(sid, String(c.phone));
    }
  }

  // --- abonementlar o'quvchi bo'yicha ---
  const enrOf = new Map<string, Row[]>();
  for (const e of enrollments) {
    const sid = String(e.student_id);
    (enrOf.get(sid) ?? enrOf.set(sid, []).get(sid)!).push(e);
  }

  const studentsOut = students.map((s) => {
    const id = String(s.id);
    return {
      id,
      name: String(s.full_name || '').trim(),
      tel: telOf.get(id) ?? '',
      ptel: ptelOf.get(id) ?? '',
      sex: s.sex,
      bd: d10(s.birthday as string),
      bal: num(s.balance),
      scores: num(s.scores),
      coins: num(s.coins),
      note: s.note ?? '',
      active: s.status === 'active',
      groups: (enrOf.get(id) ?? []).map((e) => ({
        gid: String(e.group_id),
        group: e.gname,
        course: e.course,
        teacher: e.teacher,
        status: e.status,
        fee: String(num(e.tariff_amount)),
        start: d10(e.activation_date as string),
        days: e.days,
      })),
    };
  });

  // --- guruh to'lov tarifi (abonementlardan o'rtacha) ---
  const feeAcc = new Map<string, { sum: number; n: number }>();
  for (const e of enrollments) {
    const gid = String(e.group_id);
    const a = feeAcc.get(gid) ?? feeAcc.set(gid, { sum: 0, n: 0 }).get(gid)!;
    const f = num(e.tariff_amount);
    if (f) {
      a.sum += f;
      a.n++;
    }
  }
  const groupFee = (gid: string) => {
    const a = feeAcc.get(gid);
    return a && a.n ? Math.round(a.sum / a.n) : null;
  };

  const groupsOut = groups.map((g) => ({
    id: String(g.id),
    name: g.name,
    course: g.course,
    teacher: g.teacher,
    teacherId: g.head_teacher_id ? String(g.head_teacher_id) : null,
    room: g.room,
    days: g.days,
    start: d10(g.start_date as string),
    end: d10(g.end_date as string),
    limit: num(g.student_limit),
    fee: groupFee(String(g.id)),
  }));

  // --- kurslar (guruhlardan) ---
  const courseMap = new Map<string, { name: string; groups: number; fees: number[] }>();
  for (const g of groupsOut) {
    const name = (g.course as string) || '—';
    const c = courseMap.get(name) ?? courseMap.set(name, { name, groups: 0, fees: [] }).get(name)!;
    c.groups++;
    if (g.fee) c.fees.push(g.fee);
  }
  const courseIdByName = new Map(crmCourses.map((c) => [c.name as string, String(c.id)]));
  // kurslar ro'yxatiga guruhsiz kurslarni ham qo'shamiz (crm_courses dan)
  for (const c of crmCourses) {
    const nm = c.name as string;
    if (nm && !courseMap.has(nm)) courseMap.set(nm, { name: nm, groups: 0, fees: [] });
  }
  const coursesOut = [...courseMap.values()]
    .map((c) => ({ id: courseIdByName.get(c.name) ?? null, name: c.name, groups: c.groups, fee: c.fees.length ? Math.round(c.fees.reduce((a, b) => a + b, 0) / c.fees.length) : null }))
    .sort((a, b) => b.groups - a.groups);

  const paymentsOut = payments.map((p) => ({
    id: String(p.id),
    date: d10(p.paid_at as string),
    amt: num(p.amount),
    m: p.method,
    sid: p.student_id ? String(p.student_id) : null,
    sn: p.sn,
    group: p.group_name,
    refund: !!p.is_refund,
    ref: num(p.refund_amount),
  }));

  const expensesOut = expenses.map((e) => ({ date: d10(e.spent_at as string), amt: num(e.amount), cat: e.category, c: e.note }));

  const leadsOut = leads.map((l) => ({
    id: String(l.id),
    name: l.name,
    tel: l.phone,
    sec: l.section_id ? String(l.section_id) : '',
    course: l.course,
    note: l.note,
    date: d10(l.created_at as string),
    source: l.source ?? null,
    converted: !!l.converted_student_id,
  }));

  const leadSectionsOut = sections.map((s) => ({ _id: String(s.id), name: s.name }));

  // --- davomat + xulosalar (attStudent / attGroup) ---
  const attStudent: Record<string, { p: number; a: number; late: number }> = {};
  const attGroup: Record<string, { p: number; a: number; late: number }> = {};
  const attendanceOut = attendance.map((r) => {
    const sid = String(r.student_id);
    const gid = String(r.group_id);
    const p = r.present ? 1 : 0;
    const late = r.is_late ? 1 : 0;
    for (const [k, mp] of [[sid, attStudent], [gid, attGroup]] as const) {
      const dd = (mp[k] ??= { p: 0, a: 0, late: 0 });
      if (p) dd.p++;
      else dd.a++;
      dd.late += late;
    }
    return { sid, gid, date: d10(r.att_date as string), p, late };
  });
  attendanceOut.sort((a, b) => (a.date < b.date ? 1 : -1));

  // --- dashboard statistikasi ---
  const month = tashkent({ year: 'numeric', month: '2-digit' }); // 'YYYY-MM'
  const today = tashkent({ year: 'numeric', month: '2-digit', day: '2-digit' }); // 'YYYY-MM-DD'
  const sumIn = (arr: { date: string; amt: number; refund?: boolean }[]) =>
    arr.filter((x) => x.date.slice(0, 7) === month && !x.refund).reduce((s, x) => s + x.amt, 0);
  const activeEnr = enrollments.filter((e) => e.status === 'active').length;
  const frozenEnr = enrollments.filter((e) => e.status === 'frozen').length;
  const groupedSids = new Set(enrollments.filter((e) => e.status === 'active').map((e) => String(e.student_id)));

  const takenGroups = new Set(attendanceOut.filter((a) => a.date === today).map((a) => a.gid));
  const pending = groupsOut
    .filter((g) => !takenGroups.has(g.id))
    .map((g) => ({ name: g.name, teacher: g.teacher }));

  const stats = {
    students: studentsOut.filter((s) => s.active).length,
    leads: leadsOut.length,
    groups: groupsOut.length,
    debtors: studentsOut.filter((s) => s.bal < 0).length,
    trial: 0,
    payments: sumIn(paymentsOut),
    expenses: expensesOut.filter((e) => e.date.slice(0, 7) === month).reduce((s, e) => s + e.amt, 0),
    withdraws: 0,
    notGrouped: studentsOut.filter((s) => s.active && !groupedSids.has(s.id)).length,
    trends: {},
  };

  const overview = {
    abonements: { active: { count: activeEnr }, frozen: { count: frozenEnr } },
    attendanceToday: { taken: takenGroups.size, total: groupsOut.length, pending },
  };

  return {
    generated: today,
    students: studentsOut,
    groups: groupsOut,
    teachers: teachers.map((t) => ({
      id: String(t.id),
      name: t.display_name,
      profileId: t.profile_id ? String(t.profile_id) : null,
      staffName: t.first_name || t.last_name ? `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() : null,
    })),
    staff: staff.map((p) => ({ id: String(p.id), name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(), role: p.role })),
    acct: acct.map((a) => ({ code: String(a.code), name: a.name, type: a.type })),
    finance: {
      income: (settings[0]?.income_acct as string) ?? null,
      cash: (settings[0]?.cash_acct as string) ?? null,
      posted: num(postedRows[0]?.c),
    },
    archivedStudents: archStudents.map((s) => ({ id: String(s.id), name: s.full_name, left: d10(s.archived_at as string), reason: s.leave_reason ?? null })),
    archivedGroups: archGroups.map((g) => ({ id: String(g.id), name: g.name })),
    cfg: {
      centerName: (settings[0]?.center_name as string) ?? null,
      cycleDays: num(settings[0]?.cycle_days) || 30,
      lateAfter: num(settings[0]?.late_after_minutes) || 10,
      currency: (settings[0]?.currency as string) ?? 'UZS',
    },
    announcements: announcements.map((a) => ({ id: String(a.id), title: a.title, body: a.body, date: d10(a.created_at as string) })),
    behaviours: behaviours.map((b) => ({ id: String(b.id), sid: String(b.student_id), kind: b.kind, points: num(b.points), note: b.note, date: d10(b.created_at as string) })),
    rooms: rooms.map((r) => ({ id: String(r.id), name: r.name, capacity: r.capacity == null ? null : num(r.capacity) })),
    exams: exams.map((e) => ({ id: String(e.id), sid: e.student_id ? String(e.student_id) : null, sn: e.sn, group: e.group_name, name: e.name, date: d10(e.exam_date as string), score: e.score == null ? null : num(e.score), max: num(e.max_score) || 100, passed: !!e.passed, cert: !!e.cert, note: e.note })),
    courses: coursesOut,
    payments: paymentsOut,
    expenses: expensesOut,
    leads: leadsOut,
    leadSections: leadSectionsOut,
    attendance: attendanceOut,
    attStudent,
    attGroup,
    overview,
    stats,
  };
}
