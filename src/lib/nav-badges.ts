import 'server-only';
import { sql } from '@/lib/db/client';
import type { NavItem } from '@/lib/nav';

/**
 * Single source of truth for which sidebar "new" dots should be lit for a
 * user — used both for the (app) layout's first server-rendered paint and
 * for the live re-check NavBadgesProvider triggers whenever
 * nav_badge_signals/{uid} changes in Firestore (see
 * components/app-shell/nav-badges-context.tsx). Re-derives the true
 * boolean from Cloud SQL every time rather than trusting any live payload,
 * since a bulk "mark seen" can leave other unseen rows behind.
 */
export async function computeNavBadgeKeys(userId: string): Promise<NavItem['key'][]> {
  const [[tasks], [issues], [companyNews], [chat], [warnings]] = await Promise.all([
    sql<{ count: number }[]>`select count(*)::int from tasks where assigned_to = ${userId} and is_seen = false`,
    // Issues is CEO-exclusive now — only light the dot for the CEO, never
    // for a non-CEO still carrying a stale `assigned_to` row.
    sql<{ count: number }[]>`
      select count(*)::int from issues
      where assigned_to = ${userId} and is_seen = false
        and exists (select 1 from profiles where id = ${userId} and role = 'ceo')
    `,
    sql<{ count: number }[]>`
      select count(*)::int from company_news cn
      where cn.created_at >= now() - interval '7 days'
        and not exists (select 1 from company_news_reads r where r.news_id = cn.id and r.user_id = ${userId})
    `,
    sql<{ count: number }[]>`select count(*)::int from staff_chats where receiver_id = ${userId} and is_read = false`,
    sql<{ count: number }[]>`select count(*)::int from staff_warnings where staff_id = ${userId} and is_seen = false`,
  ]);

  const keys: NavItem['key'][] = [];
  if (tasks.count > 0) keys.push('tasks');
  if (issues.count > 0) keys.push('issues');
  if (companyNews.count > 0) keys.push('companyNews');
  if (chat.count > 0) keys.push('chat');
  if (warnings.count > 0) keys.push('profile');
  return keys;
}

/** Straight port of unseen_company_news_count() — used where the raw count
 * is shown (not just an on/off dot), e.g. the dashboard's company news card. */
export async function unseenCompanyNewsCount(userId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int from company_news cn
    where cn.created_at >= now() - interval '7 days'
      and not exists (select 1 from company_news_reads r where r.news_id = cn.id and r.user_id = ${userId})
  `;
  return row.count;
}
