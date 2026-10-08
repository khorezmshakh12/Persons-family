'use client';

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ArrowDown,
  ArrowLeft,
  AtSign,
  Bell,
  BellOff,
  CalendarClock,
  ClipboardList,
  Copy,
  FileText,
  Hash,
  Loader2,
  Lock,
  Megaphone,
  MessageSquareText,
  Paperclip,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  SendHorizontal,
  SmilePlus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import {
  cancelScheduledChannelMessageAction,
  deleteChannelMessageAction,
  editChannelMessageAction,
  getChannelPageAction,
  getThreadAction,
  markChannelReadAction,
  sendChannelMessageAction,
  setChannelMutedAction,
  toggleChannelReactionAction,
  togglePinChannelMessageAction,
  type ChannelPage,
} from '@/lib/actions/chat-channels';
import type { ChannelMessage, ChannelSummary } from '@/lib/chat-channels';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import type { ChatSender } from './message-bubble';
import { dayLabel, fileNameOf, flashMessage, fmtDayTime, fmtTime, nameOf, PersonAvatar, renderBody, taskHref, tashkentDay, uploadChatFile } from './chat-kit';

const QUICK = ['👍', '❤️', '😂', '🔥', '✅', '👀'];

export function ChannelGlyph({ c, className }: { c: Pick<ChannelSummary, 'kind' | 'announce'>; className?: string }) {
  if (c.announce) return <Megaphone className={className} />;
  if (c.kind === 'group') return <Users className={className} />;
  return <Hash className={className} />;
}

/* ------------------------------------------------------------ message */

function Media({ m }: { m: ChannelMessage }) {
  if (!m.media_url) return null;
  if (m.media_type === 'image')
    return (
      <a href={m.media_url} target="_blank" rel="noreferrer" className="mt-1.5 block max-w-sm overflow-hidden rounded-xl border border-au-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img src={m.media_url} alt="" className="max-h-80 w-full object-cover" loading="lazy" />
      </a>
    );
  if (m.media_type === 'video') return <video src={m.media_url} controls className="mt-1.5 max-h-80 max-w-sm rounded-xl border border-au-line" />;
  if (m.media_type === 'voice') return <audio src={m.media_url} controls className="mt-1.5 h-10 max-w-xs" />;
  return (
    <a href={m.media_url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex max-w-sm items-center gap-2.5 rounded-xl border border-au-line bg-au-card-2 px-3 py-2 text-sm hover:bg-au-card">
      <span className="grid size-9 place-items-center rounded-lg bg-au-info-soft text-au-info">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 truncate font-semibold text-au-ink">{fileNameOf(m.media_url)}</span>
    </a>
  );
}

function MessageItem({ m, prev, people, me, mentionNames, canModerate, inThread, onThread, onChanged }: {
  m: ChannelMessage;
  prev?: ChannelMessage;
  people: Record<string, ChatSender>;
  me: string;
  mentionNames: string[];
  canModerate: boolean;
  inThread?: boolean;
  onThread?: (id: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState(false);
  const [pending, start] = useTransition();
  const sender = people[m.sender_id];
  const own = m.sender_id === me;
  const grouped = !!prev && prev.sender_id === m.sender_id && tashkentDay(prev.send_at) === tashkentDay(m.send_at) && new Date(m.send_at).getTime() - new Date(prev.send_at).getTime() < 5 * 60_000;
  const mentionsMe = m.mentions.includes(me);
  const reactions = Object.entries(m.reactions ?? {}).filter(([, u]) => u.length);

  const run = (fn: () => Promise<{ error?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error('Bajarib bo‘lmadi');
      else {
        if (ok) toast.success(ok);
        onChanged();
      }
    });

  return (
    <div
      id={`cmsg-${m.id}`}
      className={cn(
        'group relative flex scroll-mt-24 gap-3 rounded-xl px-2 transition-colors duration-700 hover:bg-au-card-2/70',
        grouped ? 'py-0.5' : 'mt-2 pt-2 pb-0.5',
        mentionsMe && 'bg-au-accent-soft/50 shadow-[inset_3px_0_0_var(--au-accent)]',
        m.pinned_at && !inThread && 'shadow-[inset_3px_0_0_var(--au-info)]',
      )}
    >
      <div className="w-9 shrink-0">
        {grouped ? (
          <span className="block pt-1 text-right text-[10px] text-au-faint opacity-0 group-hover:opacity-100">{fmtTime(m.send_at)}</span>
        ) : (
          <PersonAvatar p={sender} size={36} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold text-au-ink">{nameOf(sender)}</span>
            <span className="text-[11px] text-au-faint">{fmtTime(m.send_at)}</span>
            {m.pinned_at && !inThread && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-au-info">
                <Pin className="size-3" /> pin qilingan
              </span>
            )}
          </p>
        )}
        {editing ? (
          <form
            className="mt-1 flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && draft.trim() !== m.body) run(() => editChannelMessageAction(m.id, draft));
              setEditing(false);
            }}
          >
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={Math.min(8, draft.split('\n').length + 1)}
              className="w-full resize-none rounded-lg border border-au-line bg-au-card px-3 py-2 text-sm focus:ring-2 focus:ring-au-accent/40 focus:outline-none"
            />
            <span className="text-[11px] text-au-faint">Enter — saqlash · Esc — bekor qilish</span>
          </form>
        ) : (
          m.body && (
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-au-ink">
              {renderBody(m.body, mentionNames, nameOf(people[me]))}
              {m.edited_at && <span className="ml-1 text-[10px] text-au-faint">(tahrirlangan)</span>}
            </p>
          )
        )}
        <Media m={m} />
        {(reactions.length > 0 || picker) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {reactions.map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                disabled={pending}
                title={users.map((u) => nameOf(people[u])).join(', ')}
                onClick={() => run(() => toggleChannelReactionAction(m.id, emoji))}
                className={cn(
                  'ms-pop-in inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                  users.includes(me) ? 'border-au-info bg-au-info-soft text-au-info' : 'border-au-line bg-au-card hover:bg-au-card-2',
                )}
              >
                {emoji} <span className="font-semibold tabular-nums">{users.length}</span>
              </button>
            ))}
            {picker &&
              QUICK.filter((e) => !reactions.some(([x]) => x === e)).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setPicker(false);
                    run(() => toggleChannelReactionAction(m.id, emoji));
                  }}
                  className="ms-pop-in grid size-6 place-items-center rounded-full border border-au-line bg-au-card text-xs hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
          </div>
        )}
        {!inThread && m.reply_count > 0 && (
          <button
            type="button"
            onClick={() => onThread?.(m.id)}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-au-info hover:bg-au-info-soft"
          >
            <MessageSquareText className="size-3.5" />
            {m.reply_count} ta javob
            {m.last_reply_at && <span className="font-normal text-au-faint">· {fmtDayTime(m.last_reply_at)}</span>}
          </button>
        )}
      </div>

      {!editing && (
        <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-lg border border-au-line bg-au-card p-0.5 shadow-au-pop group-focus-within:flex group-hover:flex">
          <IconBtn label="Reaksiya" onClick={() => setPicker((v) => !v)}>
            <SmilePlus />
          </IconBtn>
          {!inThread && (
            <IconBtn label="Mavzuda javob berish" onClick={() => onThread?.(m.id)}>
              <MessageSquareText />
            </IconBtn>
          )}
          <Link href={taskHref(m.body ?? '', `${nameOf(sender)}, chat`)} title="Vazifaga aylantirish" className="grid size-7 place-items-center rounded-md text-au-muted hover:bg-au-card-2 hover:text-au-ink [&_svg]:size-3.5">
            <ClipboardList />
          </Link>
          {m.body && (
            <IconBtn
              label="Nusxa olish"
              onClick={() => {
                navigator.clipboard?.writeText(m.body ?? '');
                toast.success('Nusxa olindi');
              }}
            >
              <Copy />
            </IconBtn>
          )}
          {canModerate && !inThread && (
            <IconBtn label={m.pinned_at ? 'Pindan olish' : 'Pin qilish'} onClick={() => run(() => togglePinChannelMessageAction(m.id), m.pinned_at ? undefined : 'Pin qilindi')}>
              {m.pinned_at ? <PinOff /> : <Pin />}
            </IconBtn>
          )}
          {own && m.body && (
            <IconBtn
              label="Tahrirlash"
              onClick={() => {
                setDraft(m.body ?? '');
                setEditing(true);
              }}
            >
              <Pencil />
            </IconBtn>
          )}
          {(own || canModerate) && (
            <IconBtn label="O‘chirish" danger onClick={() => run(() => deleteChannelMessageAction(m.id), 'O‘chirildi')}>
              <Trash2 />
            </IconBtn>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn('grid size-7 place-items-center rounded-md text-au-muted hover:bg-au-card-2 [&_svg]:size-3.5', danger ? 'hover:text-au-bad' : 'hover:text-au-ink')}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ composer */

type Draft = { body: string; mentions: string[] };

const toLocalInput = (d: Date) => {
  const tz = new Date(d.getTime() + 5 * 3600_000);
  return tz.toISOString().slice(0, 16);
};
/** A datetime-local value is Tashkent wall time. */
const fromLocalInput = (v: string) => new Date(`${v}:00+05:00`);

export function ChannelComposer({ channelId, threadId, audience, people, me, disabled, placeholder, onSent }: {
  channelId: string;
  threadId?: string;
  audience: string[];
  people: Record<string, ChatSender>;
  me: string;
  disabled?: boolean;
  placeholder: string;
  onSent: (m: ChannelMessage | undefined, scheduled: boolean) => void;
}) {
  const storeKey = `persons-chat-draft-${channelId}${threadId ? `-${threadId}` : ''}`;
  const [draft, setDraft] = useState<Draft>({ body: '', mentions: [] });
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null);
  const [mIndex, setMIndex] = useState(0);
  const [schedule, setSchedule] = useState<string | null>(null);
  // Quick picks are computed when the menu opens (reading the clock in an
  // event handler, never during render).
  const [scheduleOpts, setScheduleOpts] = useState<[string, string][] | null>(null);
  const scheduleOpen = scheduleOpts !== null;
  const openSchedule = () => {
    if (scheduleOpts) return setScheduleOpts(null);
    const now = Date.now();
    const today = toLocalInput(new Date(now)).slice(0, 10);
    const tomorrow = toLocalInput(new Date(now + 86_400_000)).slice(0, 10);
    const opts: [string, Date][] = [
      ['1 soatdan keyin', new Date(now + 3600_000)],
      ['Bugun 18:00', fromLocalInput(`${today}T18:00`)],
      ['Ertaga 09:00', fromLocalInput(`${tomorrow}T09:00`)],
    ];
    setScheduleOpts(opts.filter(([, at]) => at.getTime() > now + 60_000).map(([n, at]) => [n, toLocalInput(at)]));
  };
  const setScheduleOpen = (v: boolean) => !v && setScheduleOpts(null);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Unsent drafts survive switching channels (per-viewer, this browser only).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) ?? 'null');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after hydration
      setDraft(saved && typeof saved.body === 'string' ? saved : { body: '', mentions: [] });
    } catch {
      setDraft({ body: '', mentions: [] });
    }
  }, [storeKey]);
  useEffect(() => {
    try {
      if (draft.body) sessionStorage.setItem(storeKey, JSON.stringify(draft));
      else sessionStorage.removeItem(storeKey);
    } catch {}
  }, [draft, storeKey]);

  const candidates = mention
    ? audience
        .filter((id) => id !== me && people[id])
        .filter((id) => nameOf(people[id]).toLowerCase().includes(mention.q.toLowerCase()))
        .slice(0, 6)
    : [];

  const onChange = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(upto);
    setMention(m ? { q: m[2], at: caret - m[2].length - 1 } : null);
    setMIndex(0);
    setDraft((d) => ({ body: value, mentions: d.mentions.filter((id) => value.includes(`@${nameOf(people[id])}`)) }));
  };

  const pick = (id: string) => {
    if (!mention) return;
    const name = nameOf(people[id]);
    const caret = ta.current?.selectionStart ?? draft.body.length;
    const body = `${draft.body.slice(0, mention.at)}@${name} ${draft.body.slice(caret)}`;
    setDraft({ body, mentions: [...new Set([...draft.mentions, id])] });
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.at + name.length + 2;
      ta.current?.focus();
      ta.current?.setSelectionRange(pos, pos);
    });
  };

  const send = async (media?: { url: string; kind: 'image' | 'video' | 'voice' | 'file' }) => {
    const body = draft.body.trim();
    if (!body && !media) return;
    setBusy(true);
    const sendAt = schedule ? fromLocalInput(schedule).toISOString() : undefined;
    const r = await sendChannelMessageAction({
      channelId,
      threadId,
      body: media ? '' : body,
      mediaUrl: media?.url,
      mediaType: media?.kind,
      mentions: media ? [] : draft.mentions,
      sendAt,
    });
    setBusy(false);
    if (r.error) {
      toast.error(r.error === 'readOnly' ? 'Bu kanalga faqat rahbariyat yozadi' : 'Yuborib bo‘lmadi');
      return;
    }
    if (!media) setDraft({ body: '', mentions: [] });
    if (sendAt) {
      toast.success(`Rejalashtirildi: ${fmtDayTime(sendAt)}`);
      setSchedule(null);
    }
    onSent(r.message, !!sendAt);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const up = await uploadChatFile(file);
    setBusy(false);
    if ('error' in up) {
      toast.error(up.error);
      return;
    }
    await send(up);
  };

  if (disabled) {
    return (
      <div className="ch-composer flex items-center justify-center gap-2 border-t border-au-line px-4 py-3 text-xs text-au-muted">
        <Lock className="size-3.5" /> Bu kanalga faqat rahbariyat yozadi. Postlar ostida mavzuda javob berish mumkin.
      </div>
    );
  }

  return (
    <div className="ch-composer relative border-t border-au-line px-3 py-2.5 sm:px-4">
      {candidates.length > 0 && (
        <ul role="listbox" className="ms-rise absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-xl border border-au-line bg-au-card py-1 shadow-au-pop">
          {candidates.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={i === mIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(id);
                }}
                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === mIndex ? 'bg-au-card-2' : 'hover:bg-au-card-2')}
              >
                <PersonAvatar p={people[id]} size={24} />
                <span className="truncate">{nameOf(people[id])}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {schedule && (
        <div className="ms-pop-in mb-2 inline-flex items-center gap-2 rounded-full bg-au-info-soft px-3 py-1 text-xs font-semibold text-au-info">
          <CalendarClock className="size-3.5" /> {fmtDayTime(fromLocalInput(schedule).toISOString())} da yuboriladi
          <button type="button" aria-label="Rejani bekor qilish" onClick={() => setSchedule(null)}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="Fayl biriktirish" className="grid size-10 shrink-0 place-items-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink disabled:opacity-50">
          <Paperclip className="size-[18px]" />
        </button>
        <textarea
          ref={ta}
          value={draft.body}
          disabled={busy}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onPaste={(e) => {
            const f = e.clipboardData.files?.[0];
            if (f) {
              e.preventDefault();
              onFile(f);
            }
          }}
          onKeyDown={(e) => {
            if (candidates.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMIndex((i) => (i + 1) % candidates.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMIndex((i) => (i - 1 + candidates.length) % candidates.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pick(candidates[mIndex]);
                return;
              }
              if (e.key === 'Escape') {
                setMention(null);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-au-line bg-au-card-2 px-4 py-2.5 text-sm text-au-ink [field-sizing:content] placeholder:text-au-faint focus:ring-2 focus:ring-au-accent/40 focus:outline-none"
        />
        <button
          type="button"
          aria-label="@eslatish"
          onClick={() => {
            const body = `${draft.body}${draft.body && !draft.body.endsWith(' ') ? ' ' : ''}@`;
            setDraft((d) => ({ ...d, body }));
            setMention({ q: '', at: body.length - 1 });
            ta.current?.focus();
          }}
          className="hidden size-10 shrink-0 place-items-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink sm:grid"
        >
          <AtSign className="size-[18px]" />
        </button>
        <div className="relative">
          <button type="button" aria-label="Keyinroq yuborish" onClick={openSchedule} className={cn('grid size-10 shrink-0 place-items-center rounded-full hover:bg-au-card-2', schedule ? 'text-au-info' : 'text-au-muted hover:text-au-ink')}>
            <CalendarClock className="size-[18px]" />
          </button>
          {scheduleOpen && (
            <div className="ms-rise absolute right-0 bottom-full z-20 mb-1 flex w-60 flex-col gap-1 rounded-xl border border-au-line bg-au-card p-2 shadow-au-pop">
              <p className="px-1 text-[11px] font-semibold tracking-wide text-au-muted uppercase">Keyinroq yuborish</p>
              {(scheduleOpts ?? []).map(([n, at]) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setSchedule(at);
                      setScheduleOpen(false);
                    }}
                    className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-au-card-2"
                  >
                    {n}
                  </button>
                ))}
              <input
                type="datetime-local"
                onChange={(e) => e.target.value && setSchedule(e.target.value)}
                className="mt-1 h-9 rounded-lg border border-au-line bg-au-card-2 px-2 text-sm"
              />
              <button type="button" onClick={() => setScheduleOpen(false)} className="mt-1 rounded-lg bg-au-primary px-2 py-1.5 text-sm font-semibold text-white">
                Tayyor
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !draft.body.trim()}
          onClick={() => send()}
          aria-label={schedule ? 'Rejalashtirish' : 'Yuborish'}
          className="ch-send grid size-10 shrink-0 place-items-center rounded-full bg-au-primary text-white transition-transform active:scale-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-[18px] animate-spin" /> : schedule ? <CalendarClock className="size-[18px]" /> : <SendHorizontal className="size-[18px]" />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ view */

export function ChannelView({ channel, me, people, onBack, onRead, infoOpen, onToggleInfo, onEdit, jump, onJumped }: {
  channel: ChannelSummary;
  me: string;
  people: Record<string, ChatSender>;
  onBack: () => void;
  onRead: (id: string) => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onEdit: () => void;
  /** From search: a message (and its thread) to scroll to once loaded. */
  jump: { id: string; thread: string | null } | null;
  onJumped: () => void;
}) {
  const [page, setPage] = useState<ChannelPage | null>(null);
  const [older, setOlder] = useState<ChannelMessage[]>([]);
  const [thread, setThread] = useState<{ root: ChannelMessage; replies: ChannelMessage[] } | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [muted, setMuted] = useState(channel.muted);
  const stream = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastCount = useRef(0);
  const threadRef = useRef<string | null>(null);
  useEffect(() => {
    threadRef.current = threadId;
  }, [threadId]);

  const load = useCallback(async () => {
    const r = await getChannelPageAction(channel.id);
    if ('error' in r) {
      toast.error('Kanalni ochib bo‘lmadi');
      return;
    }
    setPage(r);
    setMuted(r.muted);
    if (await markChannelReadAction(channel.id)) onRead(channel.id);
    const t = threadRef.current;
    if (t) {
      const th = await getThreadAction(t);
      if (!('error' in th)) setThread(th);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onRead is a fresh closure per render; channel.id is the key
  }, [channel.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the channel changes
    setPage(null);
    setOlder([]);
    setThread(null);
    setThreadId(null);
    lastCount.current = 0;
    load();
    let unsub: (() => void) | undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        unsub = onSnapshot(doc(getRealtimeDb(), 'board_signals', `chat-${channel.id}`), () => {
          if (first) {
            first = false;
            return;
          }
          clearTimeout(timer);
          timer = setTimeout(load, 150);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [channel.id, load]);

  const messages = [...older, ...(page?.messages ?? [])];

  // Stick to the bottom on open and when new posts land while near it.
  useEffect(() => {
    const el = stream.current;
    if (!el || !page) return;
    const grew = messages.length > lastCount.current;
    const mine = messages[messages.length - 1]?.sender_id === me;
    if (lastCount.current === 0 || (grew && (nearBottom.current || mine))) el.scrollTop = el.scrollHeight;
    lastCount.current = messages.length;
  });

  // Search jump: wait for the stream (and thread) to render, then flash.
  useEffect(() => {
    if (!jump || !page) return;
    if (jump.thread && threadId !== jump.thread) {
      openThread(jump.thread);
      return;
    }
    const t = setTimeout(() => {
      flashMessage(`cmsg-${jump.id}`);
      onJumped();
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, page, threadId, thread]);

  async function openThread(id: string) {
    setThreadId(id);
    const th = await getThreadAction(id);
    if ('error' in th) {
      toast.error('Mavzuni ochib bo‘lmadi');
      setThreadId(null);
    } else setThread(th);
  }

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const el = stream.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const r = await getChannelPageAction(channel.id, first.send_at);
    if ('error' in r) return;
    setOlder((o) => [...r.messages, ...o]);
    setPage((p) => (p ? { ...p, hasMore: r.hasMore } : p));
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  const audience = page?.audience ?? [];
  const mentionNames = audience.map((id) => nameOf(people[id]));

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', threadId && 'hidden lg:flex')}>
        <div className="ch-head flex items-center gap-3 border-b border-au-line px-4 py-3">
          <button type="button" onClick={onBack} aria-label="Ro‘yxatga qaytish" className="tap-scale -ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink sm:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-au-card-2 text-au-ink">
            <ChannelGlyph c={channel} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-au-ink">{channel.name}</h2>
            <p className="truncate text-xs text-au-faint">
              {audience.length ? `${audience.length} a’zo` : '…'}
              {channel.topic && ` · ${channel.topic}`}
            </p>
          </div>
          <IconBtnLg
            label={muted ? 'Ovozni yoqish' : 'Ovozsiz qilish'}
            onClick={async () => {
              const next = !muted;
              setMuted(next);
              const r = await setChannelMutedAction(channel.id, next);
              if (r.error) setMuted(!next);
              else toast.success(next ? 'Kanal ovozsiz' : 'Bildirishnomalar yoqildi');
            }}
          >
            {muted ? <BellOff /> : <Bell />}
          </IconBtnLg>
          {page?.canModerate && (
            <IconBtnLg label="Kanal sozlamalari" onClick={onEdit}>
              <Pencil />
            </IconBtnLg>
          )}
          <IconBtnLg label="Ma’lumot paneli" onClick={onToggleInfo} active={infoOpen}>
            <PanelRight />
          </IconBtnLg>
        </div>

        {page && page.pinned.length > 0 && (
          <button
            type="button"
            onClick={() => flashMessage(`cmsg-${page.pinned[0].id}`)}
            className="flex items-center gap-2 border-b border-au-line bg-au-info-soft/50 px-4 py-2 text-left text-xs hover:bg-au-info-soft"
          >
            <Pin className="size-3.5 shrink-0 text-au-info" />
            <span className="font-semibold text-au-info">{page.pinned.length > 1 ? `${page.pinned.length} ta pin` : 'Pin'}</span>
            <span className="min-w-0 flex-1 truncate text-au-ink">{page.pinned[0].body ?? '📎 Fayl'}</span>
          </button>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={stream}
            onScroll={(e) => {
              const el = e.currentTarget;
              const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
              nearBottom.current = gap < 140;
              setShowJump(gap > 400);
            }}
            className="ch-stream min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4"
          >
            {!page ? (
              <div className="flex flex-col gap-4 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex animate-pulse gap-3">
                    <span className="size-9 rounded-full bg-au-card-2" />
                    <span className="flex flex-1 flex-col gap-2">
                      <span className="h-3 w-32 rounded bg-au-card-2" />
                      <span className="h-3 w-2/3 rounded bg-au-card-2" />
                    </span>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-au-card-2">
                  <ChannelGlyph c={channel} className="size-6 text-au-accent-text" />
                </span>
                <p className="text-sm font-semibold text-au-ink">#{channel.name} — boshlanishi</p>
                <p className="max-w-xs text-xs text-au-muted">{channel.topic ?? 'Birinchi xabarni yozing.'}</p>
              </div>
            ) : (
              <>
                {page.hasMore && (
                  <div className="flex justify-center py-2">
                    <button type="button" onClick={loadOlder} className="rounded-full border border-au-line px-3 py-1 text-xs font-semibold text-au-muted hover:bg-au-card-2">
                      Oldingi xabarlar
                    </button>
                  </div>
                )}
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const newDay = !prev || tashkentDay(prev.send_at) !== tashkentDay(m.send_at);
                  return (
                    <Fragment key={m.id}>
                      {newDay && (
                        <div className="ch-day sticky top-1 z-10 my-3 flex justify-center">
                          <span>{dayLabel(tashkentDay(m.send_at))}</span>
                        </div>
                      )}
                      <MessageItem
                        m={m}
                        prev={newDay ? undefined : prev}
                        people={people}
                        me={me}
                        mentionNames={mentionNames}
                        canModerate={page.canModerate}
                        onThread={openThread}
                        onChanged={load}
                      />
                    </Fragment>
                  );
                })}
              </>
            )}
          </div>
          {showJump && (
            <button type="button" className="ch-jump" aria-label="Oxirgi xabarga" onClick={() => stream.current?.scrollTo({ top: stream.current.scrollHeight, behavior: 'smooth' })}>
              <ArrowDown className="size-5" />
            </button>
          )}
        </div>

        {page && page.scheduled.length > 0 && (
          <div className="border-t border-au-line bg-au-card-2/60 px-4 py-2 text-xs">
            <button type="button" onClick={() => setShowScheduled((v) => !v)} className="inline-flex items-center gap-1.5 font-semibold text-au-info">
              <CalendarClock className="size-3.5" /> {page.scheduled.length} ta rejalashtirilgan xabar
            </button>
            {showScheduled && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {page.scheduled.map((s) => (
                  <li key={s.id} className="ms-rise flex items-center gap-2 rounded-lg bg-au-card px-3 py-2">
                    <span className="shrink-0 font-semibold text-au-ink">{fmtDayTime(s.send_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-au-muted">{s.body ?? '📎 Fayl'}</span>
                    <button
                      type="button"
                      aria-label="Bekor qilish"
                      onClick={async () => {
                        const r = await cancelScheduledChannelMessageAction(s.id);
                        if (r.error) toast.error('Bekor qilib bo‘lmadi');
                        else load();
                      }}
                      className="text-au-faint hover:text-au-bad"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ChannelComposer
          channelId={channel.id}
          audience={audience}
          people={people}
          me={me}
          disabled={!!page && !page.canPost}
          placeholder={`#${channel.name} kanaliga yozing… (@ — eslatish)`}
          onSent={(m, scheduled) => {
            if (m && !scheduled) setPage((p) => (p && !p.messages.some((x) => x.id === m.id) ? { ...p, messages: [...p.messages, m] } : p));
            if (scheduled) load();
          }}
        />
      </div>

      {threadId && (
        <aside className="ms-enter-right flex min-h-0 w-full flex-col border-au-line lg:w-[380px] lg:shrink-0 lg:border-l">
          <div className="ch-head flex items-center gap-2 border-b border-au-line px-4 py-3">
            <MessageSquareText className="size-4 text-au-info" />
            <h3 className="flex-1 text-sm font-bold text-au-ink">Mavzu</h3>
            <button
              type="button"
              aria-label="Mavzuni yopish"
              onClick={() => {
                setThreadId(null);
                setThread(null);
              }}
              className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="ch-stream min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {!thread ? (
              <div className="grid place-items-center py-10">
                <Loader2 className="size-5 animate-spin text-au-faint" />
              </div>
            ) : (
              <>
                <MessageItem m={thread.root} people={people} me={me} mentionNames={mentionNames} canModerate={!!page?.canModerate} inThread onChanged={load} />
                <div className="my-2 flex items-center gap-2 px-2 text-[11px] font-semibold text-au-faint">
                  <span>{thread.replies.length} ta javob</span>
                  <span className="h-px flex-1 bg-au-line" />
                </div>
                {thread.replies.map((r, i) => (
                  <div key={r.id} className="ms-rise" style={{ ['--i' as string]: Math.min(i, 8) }}>
                    <MessageItem m={r} prev={thread.replies[i - 1]} people={people} me={me} mentionNames={mentionNames} canModerate={!!page?.canModerate} inThread onChanged={load} />
                  </div>
                ))}
              </>
            )}
          </div>
          <ChannelComposer
            channelId={channel.id}
            threadId={threadId}
            audience={audience}
            people={people}
            me={me}
            placeholder="Mavzuda javob…"
            onSent={(m) => {
              if (m) setThread((t) => (t && !t.replies.some((x) => x.id === m.id) ? { ...t, replies: [...t.replies, m] } : t));
            }}
          />
        </aside>
      )}
    </div>
  );
}

function IconBtnLg({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn('grid size-9 shrink-0 place-items-center rounded-full transition-colors [&_svg]:size-[18px]', active ? 'bg-au-card-2 text-au-ink' : 'text-au-muted hover:bg-au-card-2 hover:text-au-ink')}
    >
      {children}
    </button>
  );
}

