import 'server-only';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey, tashkentDayOfWeek } from '@/lib/time';
import { riskScore } from '@/lib/perforce';
import { suggest, RAG_META, type Rag } from '@/lib/perforce-load';

/** Claims one reminder (kind, ref, day); false when already sent. */
async function claim(kind: string, ref: string, day: string): Promise<boolean> {
  const res = await sql`insert into pf_reminders (kind, ref, day) values (${kind}, ${ref}, ${day}) on conflict do nothing`;
  return res.count > 0;
}

/**
 * Friday from 15:00 Tashkent: the owner of every active project without a
 * status in the last 6 days gets one Telegram nudge (rides on the 15-minute
 * cron; pf_reminders makes it once per project per Friday).
 */
export async function remindWeeklyStatus(now = new Date()): Promise<number> {
  const today = tashkentDayKey(now);
  const hour = Number(new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(11, 13));
  if (tashkentDayOfWeek(now) !== 5 || hour < 15) return 0;
  const rows = await sql<{ id: string; name: string; telegram_id: number | null }[]>`
    select s.id, s.name, p.telegram_id
    from strategy_spaces s join profiles p on p.id = s.owner_id
    where p.is_active and p.telegram_id is not null and s.end_date >= ${today}
      and not exists (select 1 from pf_status_updates u where u.space_id = s.id and u.created_at > now() - interval '6 days')`;
  let sent = 0;
  for (const r of rows) {
    if (!(await claim('status', r.id, today))) continue;
    await sendTelegramAs(
      'task',
      r.telegram_id!,
      `📝 <b>Haftalik holat</b>: «${escapeTelegramText(r.name)}»\nBugun juma — 3 savolga javob bering (2 daqiqa): nima qilindi, nima to‘sqinlik qilyapti, keyingi hafta nima.\nPerforce › Haftalik holat`,
    ).catch(() => {});
    sent++;
  }
  return sent;
}

/** Daily: a risk whose review date has come reminds its owner (at most
 * once a week until someone updates it). */
export async function remindRiskReviews(now = new Date()): Promise<number> {
  const today = tashkentDayKey(now);
  const rows = await sql<{ id: string; title: string; likelihood: number; impact: number; telegram_id: number | null }[]>`
    select r.id, r.title, r.likelihood, r.impact, p.telegram_id
    from pf_risks r join profiles p on p.id = r.owner_id
    where r.status in ('open', 'monitoring') and r.review_date is not null and r.review_date <= ${today}
      and p.is_active and p.telegram_id is not null
      and not exists (select 1 from pf_reminders m where m.kind = 'risk' and m.ref = r.id and m.day > ${addDaysToKey(today, -7)})`;
  let sent = 0;
  for (const r of rows) {
    if (!(await claim('risk', r.id, today))) continue;
    await sendTelegramAs(
      'task',
      r.telegram_id!,
      `⚠️ <b>Xavfni qayta ko‘rish vaqti</b>: «${escapeTelegramText(r.title)}» (ball ${riskScore(r)})\nHolatini yangilang yoki yangi sana qo‘ying: Perforce › Xavflar`,
    ).catch(() => {});
    sent++;
  }
  return sent;
}

/** One line per active project at risk, for the Monday CEO summary. */
export async function projectsAtRisk(): Promise<{ name: string; rag: Rag; why: string }[]> {
  const today = tashkentDayKey();
  const [spaces, tasks, risks, statuses] = await Promise.all([
    sql<{ id: string; name: string; start_date: string; end_date: string }[]>`
      select id, name, start_date::text as start_date, end_date::text as end_date from strategy_spaces where end_date >= ${today}`,
    sql<{ space_id: string; status: string; progress: number; end_date: string }[]>`
      select space_id, status, progress, end_date::text as end_date from strategy_tasks`,
    sql<{ space_id: string | null; likelihood: number; impact: number; status: string }[]>`select space_id, likelihood, impact, status from pf_risks`,
    sql<{ space_id: string; rag: Rag }[]>`select distinct on (space_id) space_id, rag from pf_status_updates order by space_id, created_at desc`,
  ]);
  const out: { name: string; rag: Rag; why: string }[] = [];
  for (const s of spaces) {
    const ts = tasks.filter((t) => t.space_id === s.id);
    const progress = ts.length ? ts.reduce((a, t) => a + (t.status === 'done' ? 100 : t.progress ?? 0), 0) / ts.length : 0;
    const span = Math.max(1, (Date.parse(s.end_date) - Date.parse(s.start_date)) / 86_400_000);
    const elapsed = Math.min(100, Math.max(0, ((Date.parse(today) - Date.parse(s.start_date)) / 86_400_000 / span) * 100));
    const late = ts.filter((t) => t.status !== 'done' && t.end_date < today).length;
    const high = risks.filter((r) => r.space_id === s.id && r.status !== 'closed' && r.status !== 'occurred' && riskScore(r) >= 12).length;
    const sug = suggest({ progress, elapsed, behind: elapsed - progress, late, total: ts.length, highRisks: high });
    const rag = statuses.find((x) => x.space_id === s.id)?.rag ?? sug.rag;
    if (rag !== 'green') out.push({ name: s.name, rag, why: sug.reasons.join(', ') });
  }
  return out.sort((a, b) => (a.rag === b.rag ? 0 : a.rag === 'red' ? -1 : 1));
}

export const ragLabel = (r: Rag) => RAG_META[r].n;
