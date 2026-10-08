'use client';

import { Fragment, type ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { requestChatMediaReadUrlAction, requestChatMediaUploadUrlAction } from '@/lib/actions/staff-chats';
import { CHAT_MEDIA_MAX_FILE_BYTES } from '@/lib/chat-media';
import type { ChatStatus } from '@/lib/chat-channels';
import { tashkentDayKey } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { ChatSender } from './message-bubble';

export const STATUS_META: Record<ChatStatus, { emoji: string; label: string }> = {
  lesson: { emoji: '📚', label: 'Darsda' },
  meeting: { emoji: '🗓️', label: 'Yig‘ilishda' },
  busy: { emoji: '⛔', label: 'Band' },
  away: { emoji: '🌙', label: 'Ishda emas' },
};

export function PersonAvatar({ p, size = 32, className }: { p: ChatSender | undefined; size?: number; className?: string }) {
  return (
    <Avatar className={cn('shrink-0', className)} style={{ width: size, height: size }}>
      {p?.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
      <AvatarFallback className="text-[11px]">{p ? `${p.first_name[0]}${p.last_name[0]}` : '?'}</AvatarFallback>
    </Avatar>
  );
}

export const nameOf = (p: ChatSender | undefined) => (p ? `${p.first_name} ${p.last_name}` : '—');

export const tashkentDay = (iso: string) => tashkentDayKey(new Date(iso));

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/** "Bugun" / "Kecha" / "3-oktabr". */
export function dayLabel(day: string) {
  const today = tashkentDayKey();
  if (day === today) return 'Bugun';
  if (day === tashkentDayKey(new Date(Date.now() - 86_400_000))) return 'Kecha';
  const [y, m, d] = day.split('-').map(Number);
  return `${d}-${MONTHS[m - 1]}${y !== Number(today.slice(0, 4)) ? ` ${y}` : ''}`;
}

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const fmtDayTime = (iso: string) => `${dayLabel(tashkentDay(iso))}, ${fmtTime(iso)}`;

/** Highlights @Name mentions of known people (and @siz for the viewer). */
export function renderBody(body: string, mentionNames: string[], selfName: string): ReactNode {
  const names = [...new Set(mentionNames.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!names.length) return body;
  const re = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = body.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={cn('rounded px-0.5 font-semibold', part === selfName ? 'bg-au-accent-soft text-au-accent-text' : 'text-au-info')}>
        @{part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export type UploadKind = 'image' | 'video' | 'voice' | 'file';

export function uploadKindFor(mime: string): UploadKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'voice';
  return 'file';
}

/** Signed PUT to chat_media, then a long-lived read URL for the message row. */
export async function uploadChatFile(file: File): Promise<{ url: string; kind: UploadKind } | { error: string }> {
  if (file.size > CHAT_MEDIA_MAX_FILE_BYTES) return { error: 'Fayl 50 MB dan katta' };
  const up = await requestChatMediaUploadUrlAction(file.name, file.type || 'application/octet-stream');
  if (up.error || !up.path || !up.url) return { error: 'Yuklab bo‘lmadi' };
  const res = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!res.ok) return { error: 'Yuklab bo‘lmadi' };
  const read = await requestChatMediaReadUrlAction(up.path);
  if (read.error || !read.signedUrl) return { error: 'Yuklab bo‘lmadi' };
  return { url: read.signedUrl, kind: uploadKindFor(file.type) };
}

/** Pulls the file name back out of a signed storage URL ("<uuid>-name.pdf"). */
export function fileNameOf(url: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return last.replace(/^[0-9a-f-]{36}-/, '') || 'fayl';
  } catch {
    return 'fayl';
  }
}

/** Jump to a message in the open stream and flash it. */
export function flashMessage(domId: string) {
  const el = document.getElementById(domId);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('ch-flash');
  void el.offsetWidth;
  el.classList.add('ch-flash');
  return true;
}

/** Prefilled "new task" on the Tasks page from a chat message. */
export function taskHref(text: string, from: string) {
  const title = text.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Chatdan vazifa';
  return `/tasks?new=1&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(`${text.slice(0, 1500)}\n\n— ${from}`)}`;
}
