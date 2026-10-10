import 'server-only';
import { sql } from '@/lib/db/client';
import { bumpBoardSignal } from '@/lib/gcp/firestoreAdmin';
import { escapeTelegramText, notifyUsers } from '@/lib/telegram';
import { AUTO_CLOSE_DAYS, PRIORITY_META, type Priority } from '@/lib/issues-flow';

/** Murojaatlar markazi — the background side: a linked task finishing,
 * response/resolve deadlines passing, and resolved issues the reporter
 * never answered. All idempotent (guarded updates), all swallow errors. */

const link = (id: string) => `/issues?id=${id}`;

async function ceoIds(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select distinct p.id from profiles p
    where p.is_active and (p.role = 'ceo' or exists (select 1 from profile_roles r where r.user_id = p.id and r.role = 'ceo'))`;
  return rows.map((r) => r.id);
}

/** Called when a task becomes done (finalizeTaskDone): its linked issues
 * resolve and their reporters are asked to confirm. */
export async function syncIssuesForTask(taskId: string, actorId: string | null): Promise<void> {
  try {
    const rows = await sql<{ id: string; title: string; created_by: string }[]>`
      update issues set status = 'done', resolved_at = now(), resolved_by = ${actorId}, accepted_at = coalesce(accepted_at, now())
      where task_id = ${taskId} and status <> 'done'
      returning id, title, created_by`;
    for (const r of rows) {
      await sql`insert into issue_events (issue_id, actor_id, kind, note) values (${r.id}, ${actorId}, 'resolved', 'Bog‘langan vazifa bajarildi')`;
      await notifyUsers(
        'issue',
        [r.created_by],
        `✅ <b>Murojaatingiz hal qilindi</b>\n«${escapeTelegramText(r.title)}»\nBog‘langan vazifa bajarildi. Iltimos, tasdiqlang: hal bo‘ldimi?`,
        { href: link(r.id), action: true, ref: `issue:${r.id}:confirm` },
      );
    }
    if (rows.length) await bumpBoardSignal('issues');
  } catch (error) {
    console.error('syncIssuesForTask failed', error instanceof Error ? error.message : error);
  }
}

/** 15-minute cron: one nudge when the response deadline passes (still
 * "Yangi") and one when the resolve deadline passes (not resolved yet) —
 * to the assignee and the CEO. `sla_warned` makes each fire once. */
export async function remindIssueDeadlines(): Promise<number> {
  let sent = 0;
  try {
    const rows = await sql<{ id: string; title: string; priority: Priority; assigned_to: string | null; what: 'respond' | 'resolve' }[]>`
      update issues i set sla_warned = x.what
      from (
        select id, case when status = 'open' and accepted_at is null then 'respond' else 'resolve' end as what
        from issues
        where (status = 'open' and accepted_at is null and respond_by < now() and sla_warned is null)
           or (status <> 'done' and (accepted_at is not null or status = 'in_progress') and resolve_by < now()
               and sla_warned is distinct from 'resolve')
        limit 50
      ) x
      where i.id = x.id
      returning i.id, i.title, i.priority, i.assigned_to, x.what`;
    if (!rows.length) return 0;
    const ceos = await ceoIds();
    for (const r of rows) {
      const what = r.what === 'respond' ? `javob muddati (${PRIORITY_META[r.priority].respondH} soat)` : 'hal qilish muddati';
      await notifyUsers(
        'issue',
        [r.assigned_to, ...ceos],
        `⏰ <b>Murojaat muddati o‘tdi</b> — ${what}\n«${escapeTelegramText(r.title)}» · ${PRIORITY_META[r.priority].n}`,
        { href: link(r.id), action: true, ref: `issue:${r.id}` },
      );
      sent++;
    }
    await bumpBoardSignal('issues');
  } catch (error) {
    console.error('remindIssueDeadlines failed', error instanceof Error ? error.message : error);
  }
  return sent;
}

/** Daily: resolved issues the reporter hasn't answered in AUTO_CLOSE_DAYS
 * close themselves (counted as confirmed — silence means it's fine). */
export async function autoCloseResolvedIssues(): Promise<number> {
  try {
    const rows = await sql<{ id: string }[]>`
      update issues set closed_at = now()
      where status = 'done' and closed_at is null and resolved_at < now() - make_interval(days => ${AUTO_CLOSE_DAYS})
      returning id`;
    for (const r of rows) {
      await sql`insert into issue_events (issue_id, actor_id, kind, note) values (${r.id}, null, 'auto_closed', ${`${AUTO_CLOSE_DAYS} kun javob bo‘lmadi`})`;
      await sql`update notifications set action = false where ref = ${`issue:${r.id}:confirm`} and action`;
    }
    if (rows.length) await bumpBoardSignal('issues');
    return rows.length;
  } catch (error) {
    console.error('autoCloseResolvedIssues failed', error instanceof Error ? error.message : error);
    return 0;
  }
}
