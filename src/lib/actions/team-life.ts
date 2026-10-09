'use server';

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { can } from '@/lib/permissions';
import { bumpSignal } from '@/lib/gcp/firestoreAdmin';
import { escapeTelegramText, sendTelegramManyAs, sendTelegramMessageToMany } from '@/lib/telegram';
import { broadcastNews } from '@/lib/news-delivery';
import { logSystemAction } from '@/lib/audit-log';
import { loadCalendar, newsAudience } from '@/lib/team-life-data';
import { EVENT_KINDS, NEWS_CATEGORIES, type CalEvent } from '@/lib/team-life';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function requirePublisher(): Promise<{ id: string } | { error: string }> {
  try {
    const { user } = await requireCap('news.publish');
    return { id: user.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

function done() {
  revalidatePath('/[locale]/company-news', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

/* ------------------------------------------------------------ calendar */

export async function getCalendarAction(from: string, to: string, scope: 'mine' | 'all'): Promise<Result<{ events: CalEvent[] }>> {
  const { profile } = await getAuthState();
  if (!profile) return { error: 'sessionExpired' };
  if (!day.safeParse(from).success || !day.safeParse(to).success || from > to) return { error: 'invalidInput' };
  // A view never needs more than ~6 weeks; cap it so a crafted call can't scan years.
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 62) return { error: 'invalidInput' };
  try {
    return { events: await loadCalendar(profile, from, to, scope === 'mine' ? 'mine' : 'all') };
  } catch (error) {
    console.error('getCalendarAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }
}

const eventSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  day: day,
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  endDay: day.nullable().default(null),
  location: z.string().trim().max(160).default(''),
  kind: z.enum(EVENT_KINDS).default('company'),
  repeat: z.enum(['none', 'weekly', 'monthly', 'yearly']).default('none'),
  repeatUntil: day.nullable().default(null),
  notify: z.boolean().default(false),
});

export async function saveEventAction(input: z.input<typeof eventSchema>): Promise<Result<{ id: string }>> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  const p = eventSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  if (v.endDay && v.endDay < v.day) return { error: 'invalidInput' };
  const starts = `${v.day}T${v.time ?? '00:00'}:00+05:00`;
  const ends = v.endDay ? `${v.endDay}T${v.time ?? '00:00'}:00+05:00` : null;
  try {
    const [row] = v.id
      ? await sql<{ id: string }[]>`
          update events set title = ${v.title}, description = ${v.description}, starts_at = ${starts}, ends_at = ${ends},
            all_day = ${!v.time}, location = ${v.location}, kind = ${v.kind}, repeat = ${v.repeat}, repeat_until = ${v.repeatUntil}
          where id = ${v.id} and deleted_at is null returning id`
      : await sql<{ id: string }[]>`
          insert into events (title, description, starts_at, ends_at, all_day, location, kind, repeat, repeat_until, created_by)
          values (${v.title}, ${v.description}, ${starts}, ${ends}, ${!v.time}, ${v.location}, ${v.kind}, ${v.repeat}, ${v.repeatUntil}, ${g.id})
          returning id`;
    if (!row) return { error: 'notFound' };
    if (v.notify && !v.id)
      after(async () => {
        const staff = await sql<{ telegram_id: number }[]>`select telegram_id from profiles where is_active and telegram_id is not null`;
        await sendTelegramManyAs('news', 
          staff.map((s) => s.telegram_id),
          `📅 <b>${escapeTelegramText(v.title)}</b>\n${v.day}${v.time ? ` ${v.time}` : ''}${v.location ? ` · ${escapeTelegramText(v.location)}` : ''}\nKalendar: Jamoa hayoti bo‘limida`,
        ).catch(() => {});
      });
    done();
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

/** Soft delete — `restoreEventAction` is the undo. */
export async function deleteEventAction(id: string): Promise<Result> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const res = await sql`update events set deleted_at = now() where id = ${id} and deleted_at is null`.catch(() => null);
  if (!res) return { error: 'updateFailed' };
  if (res.count === 0) return { error: 'notFound' };
  done();
  return {};
}

export async function restoreEventAction(id: string): Promise<Result> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  await sql`update events set deleted_at = null where id = ${id}`.catch(() => null);
  done();
  return {};
}

export async function respondEventAction(eventId: string, response: 'yes' | 'no' | 'maybe' | null): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!uuid.safeParse(eventId).success || (response && !['yes', 'no', 'maybe'].includes(response))) return { error: 'invalidInput' };
  try {
    if (response)
      await sql`
        insert into event_attendees (event_id, user_id, response) values (${eventId}, ${user.id}, ${response})
        on conflict (event_id, user_id) do update set response = excluded.response, updated_at = now()`;
    else await sql`delete from event_attendees where event_id = ${eventId} and user_id = ${user.id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

/* ------------------------------------------------------------ news */

const newsSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(8000),
  category: z.enum(NEWS_CATEGORIES).default('general'),
  pinned: z.boolean().default(false),
  mustAck: z.boolean().default(false),
  publishAt: z.string().datetime({ offset: true }).nullable().default(null),
  audience: z.enum(['all', 'top', 'acad', 'com', 'ops', 'fin', 'hr']).default('all'),
  imageUrl: z.string().max(1000).refine((u) => !u || u.startsWith('https://'), 'url').default(''),
  notify: z.boolean().default(true),
});

export async function saveNewsAction(input: z.input<typeof newsSchema>): Promise<Result<{ id: string }>> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  const p = newsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const [row] = v.id
      ? await sql<{ id: string }[]>`
          update company_news set title = ${v.title}, content = ${v.content}, category = ${v.category}, pinned = ${v.pinned},
            must_ack = ${v.mustAck}, publish_at = ${v.publishAt}, audience = ${v.audience}, image_url = ${v.imageUrl || null}, notify = ${v.notify}
          where id = ${v.id} and deleted_at is null returning id`
      : await sql<{ id: string }[]>`
          insert into company_news (title, content, created_by, category, pinned, must_ack, publish_at, audience, image_url, notify)
          values (${v.title}, ${v.content}, ${g.id}, ${v.category}, ${v.pinned}, ${v.mustAck}, ${v.publishAt}, ${v.audience}, ${v.imageUrl || null}, ${v.notify})
          returning id`;
    if (!row) return { error: 'notFound' };
    if (!v.id) {
      after(() => sql`insert into company_news_reads (news_id, user_id) values (${row.id}, ${g.id}) on conflict do nothing`);
      after(() => broadcastNews(row.id));
    }
    await bumpSignal('board_signals/company_news');
    logSystemAction('news.save', `${v.id ? 'Edited' : 'Published'} "${v.title}"`);
    done();
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

async function requireNewsOwnerOrAdmin(newsId: string): Promise<{ id: string } | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const [n] = await sql<{ created_by: string | null }[]>`select created_by from company_news where id = ${newsId}`;
  if (!n) return { error: 'notFound' };
  if (n.created_by !== user.id && !can(profile.role, 'news.publish')) return { error: 'forbidden' };
  return { id: user.id };
}

export async function deleteNewsSoftAction(id: string): Promise<Result> {
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const g = await requireNewsOwnerOrAdmin(id);
  if ('error' in g) return g;
  await sql`update company_news set deleted_at = now() where id = ${id}`.catch(() => null);
  await bumpSignal('board_signals/company_news');
  done();
  return {};
}

export async function restoreNewsAction(id: string): Promise<Result> {
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const g = await requireNewsOwnerOrAdmin(id);
  if ('error' in g) return g;
  await sql`update company_news set deleted_at = null where id = ${id}`.catch(() => null);
  await bumpSignal('board_signals/company_news');
  done();
  return {};
}

export async function togglePinNewsAction(id: string, pinned: boolean): Promise<Result> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  await sql`update company_news set pinned = ${pinned} where id = ${id}`.catch(() => null);
  done();
  return {};
}

export async function ackNewsAction(id: string): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql`insert into company_news_acks (news_id, user_id) values (${id}, ${user.id}) on conflict do nothing`;
    await sql`insert into company_news_reads (news_id, user_id) values (${id}, ${user.id}) on conflict do nothing`;
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

const EMOJI = ['👍', '❤️', '🎉', '👏', '🙏'];

export async function reactNewsAction(id: string, emoji: string): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!uuid.safeParse(id).success || !EMOJI.includes(emoji)) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from company_news_reactions where news_id = ${id} and user_id = ${user.id} and emoji = ${emoji}`;
    if (res.count === 0) await sql`insert into company_news_reactions (news_id, user_id, emoji) values (${id}, ${user.id}, ${emoji}) on conflict do nothing`;
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

export async function getNewsAudienceAction(id: string): Promise<Result<{ acked: string[]; read: string[]; pending: string[] }>> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  return newsAudience(id);
}

/** Telegram nudge to everyone who hasn't acknowledged a must-read post. */
export async function remindUnackedAction(id: string): Promise<Result<{ sent: number }>> {
  const g = await requirePublisher();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const [n] = await sql<{ title: string }[]>`select title from company_news where id = ${id} and must_ack and deleted_at is null`;
  if (!n) return { error: 'notFound' };
  const rows = await sql<{ telegram_id: number }[]>`
    select p.telegram_id from profiles p
    where p.is_active and p.telegram_id is not null
      and not exists (select 1 from company_news_acks a where a.news_id = ${id} and a.user_id = p.id)`;
  await sendTelegramMessageToMany(
    rows.map((r) => r.telegram_id),
    `🔔 Eslatma: <b>${escapeTelegramText(n.title)}</b> e’loni bilan tanishib, “Tanishdim”ni bosing.`,
  ).catch(() => {});
  return { sent: rows.length };
}

/* ------------------------------------------------------------ calendar feed */

/** Personal .ics feed link; `rotate` revokes the old one. */
export async function calendarTokenAction(rotate = false): Promise<Result<{ token: string }>> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  try {
    const token = randomBytes(24).toString('base64url');
    const [row] = rotate
      ? await sql<{ token: string }[]>`
          insert into calendar_tokens (user_id, token) values (${user.id}, ${token})
          on conflict (user_id) do update set token = excluded.token, created_at = now() returning token`
      : await sql<{ token: string }[]>`
          insert into calendar_tokens (user_id, token) values (${user.id}, ${token})
          on conflict (user_id) do update set user_id = excluded.user_id returning token`;
    return { token: row.token };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function revokeCalendarTokenAction(): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  await sql`delete from calendar_tokens where user_id = ${user.id}`.catch(() => null);
  return {};
}
