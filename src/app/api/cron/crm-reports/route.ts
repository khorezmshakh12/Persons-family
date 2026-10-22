import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';
import { daysBetween, nextDueDate } from '@/lib/billing';
import { loadStudentsData, type StudentRow } from '@/lib/ops-students';
import { escapeTelegramText, sendTelegramManyAs } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

// O'quvchilar to'lov hisobotlari (owner, 2026-10-22), xodimlar botidan:
//   ?kind=due      09:00 — Office Manager: to'lovga N kun (remind_days, 3) qolganlar;
//   ?kind=overdue  21:00 — CEO, COO: to'lovi call_after_days (7) kundan ko'p kechikkanlar;
//   ?kind=daily    22:00 — CEO, COO, Office Manager: kunlik moliyaviy hisobot.
//
// Cloud Scheduler (Asia/Tashkent), each with --headers="Authorization=Bearer <CRON_SECRET>":
//   crm-report-due      "0 9 * * *"   …/staff/api/cron/crm-reports?kind=due
//   crm-report-overdue  "0 21 * * *"  …/staff/api/cron/crm-reports?kind=overdue
//   crm-report-daily    "0 22 * * *"  …/staff/api/cron/crm-reports?kind=daily

const KINDS = ['due', 'overdue', 'daily'] as const;
type Kind = (typeof KINDS)[number];
const TO: Record<Kind, string[]> = {
  due: ['office_manager'],
  overdue: ['ceo', 'coo'],
  daily: ['ceo', 'coo', 'office_manager'],
};
const MAX_LINES = 18; // keeps a report under Telegram's 4,096-character limit
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const METHODS: Record<string, string> = { cash: 'Naqd', card: 'Karta', click: 'Click', payme: 'Payme', uzum: 'Uzum', transfer: 'O‘tkazma', online: 'Onlayn', other: 'Boshqa' };

const e = escapeTelegramText;
const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
const dmy = (k: string) => k.split('-').reverse().join('.');
const dayTitle = (k: string) => `${dmy(k)}, ${WEEKDAYS[new Date(`${k}T00:00:00Z`).getUTCDay()]}`;
const contact = (s: StudentRow) => s.parent || s.phone || 'telefon kiritilmagan';

function list<T>(rows: T[], line: (r: T, i: number) => string): string {
  const shown = rows.slice(0, MAX_LINES).map(line);
  if (rows.length > MAX_LINES) shown.push(`<i>… yana ${rows.length - MAX_LINES} ta — Operation HQ › O‘quvchilar</i>`);
  return shown.join('\n');
}

async function recipients(roles: string[]) {
  const rows = await sql<{ telegram_id: number }[]>`
    select distinct p.telegram_id from profiles p
    where p.is_active and p.telegram_id is not null
      and (p.role::text = any(${roles}) or exists (select 1 from profile_roles r where r.user_id = p.id and r.role::text = any(${roles})))`;
  return rows.map((r) => r.telegram_id);
}

function dueReport(rows: StudentRow[], today: string, days: number): string | null {
  const target = addDaysToKey(today, days);
  const due = rows.filter((s) => s.status === 'active' && s.fee > 0 && s.start && nextDueDate(s.start, today) === target).sort((a, b) => a.name.localeCompare(b.name));
  if (!due.length) return null;
  const total = due.reduce((a, s) => a + s.fee + Math.max(0, -s.balance), 0);
  const noTg = due.filter((s) => !s.tg).length;
  return [
    `🗓 <b>To‘lov muddatiga ${days} kun qoldi</b>`,
    `To‘lov kuni: <b>${dayTitle(target)}</b>`,
    '',
    `O‘quvchilar: <b>${due.length} ta</b> · kutilayotgan tushum: <b>${som(total)}</b>`,
    '',
    list(due, (s, i) => {
      const debt = Math.max(0, -s.balance);
      return `${i + 1}. <b>${e(s.name)}</b> — ${som(s.fee + debt)}${debt ? ` (shundan qarz ${formatUZS(debt)})` : ''}\n    ${e(contact(s))}${s.tg ? ' · eslatma yuboriladi' : ' · <b>Telegram yo‘q — qo‘ng‘iroq qiling</b>'}`;
    }),
    '',
    noTg
      ? `⚠️ ${noTg} nafar o‘quvchining ota-onasi botga ulanmagan: ularga eslatma avtomatik bormaydi, iltimos, telefon orqali ogohlantiring.`
      : '✅ Barcha ota-onalarga avtomatik eslatma yuboriladi.',
  ].join('\n');
}

function overdueReport(rows: StudentRow[], today: string, after: number): string | null {
  const late = rows.filter((s) => s.status !== 'archived' && s.balance < 0 && s.grade.openDays >= after).sort((a, b) => b.grade.openDays - a.grade.openDays);
  if (!late.length) return null;
  const total = late.reduce((a, s) => a - s.balance, 0);
  return [
    `🔴 <b>To‘lovi kechikkan o‘quvchilar</b>`,
    `${dayTitle(today)} · kechikish ${after} kundan ortiq`,
    '',
    `Jami: <b>${late.length} nafar</b> · umumiy qarz: <b>${som(total)}</b>`,
    '',
    list(late, (s, i) => {
      const call = s.lastCall ? ` · oxirgi qo‘ng‘iroq ${dmy(s.lastCall.at.slice(0, 10))}${s.lastCall.promised ? `, va’da ${dmy(s.lastCall.promised)}` : ''}` : ' · qo‘ng‘iroq qilinmagan';
      return `${i + 1}. <b>${e(s.name)}</b> — to‘lovni <b>${s.grade.openDays} kun</b> kechiktirdi, qarz ${som(-s.balance)}\n    ${e(contact(s))}${call}`;
    }),
    '',
    'Tavsiya: 14 kundan oshganlar bilan rahbariyat darajasida bog‘lanish, to‘lov rejasini (bo‘lib to‘lash) kelishish yoki muzlatishni ko‘rib chiqish.',
  ].join('\n');
}

async function dailyReport(today: string): Promise<string> {
  const d = await loadStudentsData();
  const live = d.rows.filter((s) => s.status !== 'archived');
  const billed = live.filter((s) => s.status === 'active' && s.fee > 0);
  const [charged, msgs, calls, left, back] = await Promise.all([
    sql<{ n: number; sum: number }[]>`
      select count(*)::int as n, coalesce(sum(amount), 0) as sum from crm_charges
      where source in ('auto', 'manual') and (created_at at time zone 'Asia/Tashkent')::date = ${today}`,
    sql<{ n: number; ok: number }[]>`
      select count(*)::int as n, count(*) filter (where sent > 0)::int as ok from crm_student_messages
      where (created_at at time zone 'Asia/Tashkent')::date = ${today}`,
    sql<{ n: number; promised: number }[]>`
      select count(*)::int as n, count(*) filter (where result = 'promised')::int as promised from crm_debt_calls
      where (created_at at time zone 'Asia/Tashkent')::date = ${today}`,
    sql<{ name: string; reason: string }[]>`
      select full_name as name, coalesce(nullif(leave_reason, ''), 'sababsiz') as reason from crm_students
      where (archived_at at time zone 'Asia/Tashkent')::date = ${today} order by full_name`,
    sql<{ n: number }[]>`
      select count(*)::int as n from crm_student_log where kind = 'restore' and (created_at at time zone 'Asia/Tashkent')::date = ${today}`,
  ]);
  const todayK = d.stats.kassa.filter((k) => k.today);
  const inToday = todayK.reduce((a, k) => a + k.amount, 0);
  const payCount = todayK.reduce((a, k) => a + k.count, 0);
  const byMethod = new Map<string, number>();
  for (const k of todayK) byMethod.set(k.method, (byMethod.get(k.method) ?? 0) + k.amount);
  const byStaff = new Map<string, number>();
  for (const k of todayK) byStaff.set(k.actor, (byStaff.get(k.actor) ?? 0) + k.amount);
  const debtors = live.filter((s) => s.balance < 0);
  const debt = debtors.reduce((a, s) => a - s.balance, 0);
  const late = debtors.filter((s) => s.grade.openDays >= d.settings.callAfterDays).length;
  const expected = billed.reduce((a, s) => a + s.fee, 0);
  const pct = expected ? Math.round((d.stats.collected / expected) * 100) : 0;
  const paid = billed.filter((s) => s.paidThisMonth).length;
  const soon = billed.filter((s) => s.start && daysBetween(today, nextDueDate(s.start, addDaysToKey(today, 1))) <= 3);
  const soonSum = soon.reduce((a, s) => a + s.fee, 0);
  const g = { ok: 0, late: 0, hard: 0 };
  for (const s of live) if (s.grade.total) g[s.grade.grade]++;

  return [
    `📊 <b>Kunlik hisobot — O‘quvchilar va to‘lovlar</b>`,
    dayTitle(today),
    '',
    `<b>💰 Bugungi tushum</b>`,
    payCount ? `• ${payCount} ta to‘lov · <b>${som(inToday)}</b>` : '• Bugun to‘lov qabul qilinmadi',
    ...[...byMethod].map(([m, v]) => `   ${METHODS[m] ?? m}: ${som(v)}`),
    ...(byStaff.size ? [`• Qabul qilganlar: ${[...byStaff].map(([a, v]) => `${e(a)} — ${formatUZS(v)}`).join('; ')}`] : []),
    '',
    `<b>🧾 Hisoblangan to‘lovlar</b>`,
    `• Bugun yechildi: ${charged[0].n} ta · ${som(charged[0].sum)}`,
    `• Keyingi 3 kunda yechiladi: ${soon.length} ta · ${som(soonSum)}`,
    '',
    `<b>📌 Qarzdorlik</b>`,
    `• Qarzdorlar: <b>${debtors.length} nafar</b> · jami ${som(debt)}`,
    `• ${d.settings.callAfterDays} kundan ortiq kechikkanlar: ${late} nafar`,
    `• Bugungi qo‘ng‘iroqlar: ${calls[0].n} ta${calls[0].promised ? ` (${calls[0].promised} tasi to‘lashga va’da berdi)` : ''}`,
    `• Ota-onalarga xabarlar: ${msgs[0].ok}/${msgs[0].n} yetkazildi`,
    '',
    `<b>📈 Oy holati</b>`,
    `• Tushum: ${som(d.stats.collected)} / reja ${som(expected)} — <b>${pct}%</b>`,
    `• To‘lagan o‘quvchilar: ${paid} / ${billed.length}`,
    `• To‘lov intizomi: vaqtida ${g.ok} · kechikadi ${g.late} · qiyin ${g.hard}`,
    '',
    `<b>👥 O‘quvchilar harakati</b>`,
    `• Faol: ${live.length} nafar${back[0].n ? ` · bugun qaytarildi: ${back[0].n}` : ''}`,
    left.length ? `• Bugun chiqib ketdi: ${left.length} nafar` : '• Bugun chiqib ketgan o‘quvchi yo‘q',
    ...left.slice(0, 10).map((l) => `   ${e(l.name)} — ${e(l.reason)}`),
  ].join('\n');
}

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const kind = req.nextUrl.searchParams.get('kind') as Kind | null;
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ error: 'kind must be due | overdue | daily' }, { status: 400 });

  const today = tashkentDayKey();
  const to = await recipients(TO[kind]);
  if (!to.length) return NextResponse.json({ ok: true, kind, skipped: 'no recipients' });

  let text: string | null;
  if (kind === 'daily') text = await dailyReport(today);
  else {
    const d = await loadStudentsData();
    text = kind === 'due' ? dueReport(d.rows, today, d.settings.remindDays || 3) : overdueReport(d.rows, today, d.settings.callAfterDays);
  }
  if (!text) return NextResponse.json({ ok: true, kind, skipped: 'nothing to report', recipients: to.length });

  await sendTelegramManyAs('report', to, text, { record: false });
  return NextResponse.json({ ok: true, kind, recipients: to.length, chars: text.length });
}

export const GET = withCronLog('crm-reports', handle);
