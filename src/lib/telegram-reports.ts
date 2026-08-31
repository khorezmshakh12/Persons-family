import 'server-only';
import { escapeTelegramText } from '@/lib/telegram';
import { WEEKLY_EFFICIENCY_WARN_THRESHOLD, type EfficiencyStats } from '@/lib/task-efficiency';
import type { StaffRole } from '@/lib/nav';

/**
 * Pure text rendering for the Monday weekly task bot
 * (src/app/api/cron/weekly-task-report/route.ts). Nothing here touches the
 * database or the network, so the wording can be reviewed and changed
 * without re-reading the cron logic.
 *
 * Every message goes out with Telegram's HTML parse_mode, so the `<b>` tags
 * below are ours on purpose and anything that came out of the database (a
 * person's name) must go through escapeTelegramText first — an apostrophe
 * is fine, but an `&` or `<` in a name would otherwise break the whole
 * message with a 400 from the Bot API.
 *
 * The staff is Uzbek-speaking and Telegram is outside the app's next-intl
 * setup (there is no request locale for a cron run and no per-user language
 * column on `profiles`), so this text is inline Uzbek rather than i18n keys
 * — the same convention as the daily lesson-plan report.
 */

/** The buckets the CEO's weekly summary is split into: one Telegram message
 * per group. `ceo` and `it_developer` are deliberately absent — they are not
 * scored by the weekly bot at all. */
export type ReportRoleGroup = 'teachers' | 'mmd' | 'admin_manager' | 'internship';

export const REPORT_ROLE_GROUP_LABELS: Record<ReportRoleGroup, string> = {
  teachers: 'Ustozlar',
  mmd: 'MMD',
  admin_manager: 'Administrator Manager',
  internship: 'Internship',
};

/** Fixed send order, so the CEO's four messages always arrive in the same
 * sequence week to week instead of in whatever order the rows came back. */
export const REPORT_ROLE_GROUP_ORDER: ReportRoleGroup[] = ['teachers', 'mmd', 'admin_manager', 'internship'];

/** head_teacher and assistant are reported alongside teachers — from the
 * CEO's point of view they are one teaching team ("Ustozlar"). */
const ROLE_TO_REPORT_GROUP: Partial<Record<StaffRole, ReportRoleGroup>> = {
  teacher: 'teachers',
  head_teacher: 'teachers',
  assistant: 'teachers',
  mmd: 'mmd',
  admin_manager: 'admin_manager',
  internship: 'internship',
};

/** `null` for a role that is not part of the weekly summary (ceo,
 * it_developer, or any role added to the enum later without being mapped
 * here — better to leave such a person out of the CEO's report than to
 * invent a group for them). Takes a plain string because the value comes
 * straight from a database column. */
export function reportRoleGroup(role: string): ReportRoleGroup | null {
  return ROLE_TO_REPORT_GROUP[role as StaffRole] ?? null;
}

/** '2026-08-24' + '2026-08-30' -> '24.08.2026 — 30.08.2026'. Deliberately a
 * string split rather than `new Date(...)`: the keys are already
 * Asia/Tashkent calendar dates, and parsing them back into an instant on a
 * UTC server is exactly how a Monday turns into the Sunday before it. */
export function formatWeekLabel(startKey: string, endKey: string): string {
  return `${toDotted(startKey)} — ${toDotted(endKey)}`;
}

function toDotted(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * One employee's row inside a role-group report:
 * `• Ism Familiya — 72% (vaqtida 5/7, kech 1, bajarilmagan 1)`
 *
 * A week with nothing due scores 100% by convention (see efficiencyForWeek)
 * — printing "vaqtida 0/0" for that would read as a failure, so it gets its
 * own wording instead.
 */
export function formatEmployeeWeekLine(name: string, stats: EfficiencyStats): string {
  const safeName = escapeTelegramText(name);
  if (stats.totalDue === 0) {
    return `• ${safeName} — vazifa biriktirilmagan`;
  }
  const details = [
    `vaqtida ${stats.doneOnTime}/${stats.totalDue}`,
    `kech ${stats.doneLate}`,
    `bajarilmagan ${stats.notDone}`,
  ].join(', ');
  return `• ${safeName} — ${stats.efficiencyPct}% (${details})`;
}

/**
 * One of the CEO's per-group messages. `lines` are already-rendered (and
 * already-escaped) output of formatEmployeeWeekLine — do not escape them
 * again here or the bullets' own markup would be mangled.
 */
export function formatRoleGroupReport(groupLabel: string, weekLabel: string, lines: string[]): string {
  const body = lines.length > 0 ? lines : ["• Bu guruhda faol xodim yo'q."];
  return [
    '📊 <b>Haftalik vazifa hisoboti</b>',
    `👥 <b>${escapeTelegramText(groupLabel)}</b>`,
    `🗓 ${escapeTelegramText(weekLabel)}`,
    '',
    ...body,
    '',
    `Jami: ${lines.length} ta xodim.`,
  ].join('\n');
}

/**
 * The private DM an employee gets when their week came in under
 * WEEKLY_EFFICIENCY_WARN_THRESHOLD. Only ever sent when something was
 * actually due (see the route) — an empty week is 100% and warns nobody.
 */
export function formatEmployeeWarning(name: string, stats: EfficiencyStats, weekLabel: string): string {
  return [
    '⚠️ <b>Haftalik vazifa samaradorligi</b>',
    '',
    `Hurmatli <b>${escapeTelegramText(name)}</b>, o'tgan hafta (${escapeTelegramText(weekLabel)}) bo'yicha vazifalar samaradorligingiz <b>${stats.efficiencyPct}%</b> — belgilangan ${WEEKLY_EFFICIENCY_WARN_THRESHOLD}% chegaradan past.`,
    '',
    `• Jami vazifalar: ${stats.totalDue}`,
    `• Vaqtida bajarilgan: ${stats.doneOnTime}`,
    `• Kech bajarilgan: ${stats.doneLate}`,
    `• Bajarilmagan: ${stats.notDone}`,
    '',
    "Iltimos, bu hafta vazifalarni belgilangan muddatda yakunlashga alohida e'tibor qarating.",
  ].join('\n');
}
