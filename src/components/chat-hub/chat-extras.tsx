'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Archive, ChevronDown, FileText, Image as ImageIcon, LogOut, Mic, Plus, Search, Users, Video, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  archiveChannelAction,
  createChannelGroupAction,
  getChannelPageAction,
  leaveChannelAction,
  listSharedFilesAction,
  searchChatAction,
  setChatStatusAction,
  updateChannelAction,
  type ChatFile,
  type ChatSearchHit,
  type ChatStatusMap,
} from '@/lib/actions/chat-channels';
import type { ChannelSummary, ChatStatus } from '@/lib/chat-channels';
import { cn } from '@/lib/utils';
import type { ChatSender } from './message-bubble';
import type { StaffDirectoryEntry } from './types';
import { ChannelGlyph } from './channel-view';
import { fileNameOf, fmtDayTime, nameOf, PersonAvatar, STATUS_META } from './chat-kit';

/* ------------------------------------------------------------ status */

export function StatusPicker({ mine, onChanged }: { mine: { status: ChatStatus; until: string | null } | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const set = (status: ChatStatus | null, minutes: number | null) =>
    start(async () => {
      const r = await setChatStatusAction(status, minutes);
      if (r.error) toast.error('Holatni o‘zgartirib bo‘lmadi');
      else {
        setOpen(false);
        onChanged();
      }
    });
  const meta = mine ? STATUS_META[mine.status] : null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('flex w-full items-center gap-2 rounded-xl border border-au-line px-3 py-2 text-left text-sm transition-colors hover:bg-au-card-2', meta && 'bg-au-accent-soft/50')}
      >
        <span className="text-base leading-none">{meta?.emoji ?? '🟢'}</span>
        <span className="min-w-0 flex-1 truncate font-semibold text-au-ink">{meta?.label ?? 'Ishdaman'}</span>
        {mine?.until && <span className="text-[11px] text-au-faint">{fmtDayTime(mine.until)} gacha</span>}
        <ChevronDown className="size-3.5 text-au-faint" />
      </button>
      {open && (
        <div className="ms-rise absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-au-line bg-au-card p-1.5 shadow-au-pop">
          {(Object.keys(STATUS_META) as ChatStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-au-card-2">
              <span className="w-5 text-center">{STATUS_META[s].emoji}</span>
              <span className="flex-1 text-sm font-medium">{STATUS_META[s].label}</span>
              {(
                [
                  ['1s', 60],
                  ['2s', 120],
                  ['Bugun', null],
                ] as [string, number | null][]
              ).map(([n, mins]) => (
                <button
                  key={n}
                  type="button"
                  disabled={pending}
                  onClick={() => set(s, mins ?? minutesToMidnight())}
                  className="rounded-md border border-au-line px-1.5 py-0.5 text-[11px] font-semibold text-au-muted hover:bg-au-card hover:text-au-ink"
                >
                  {n}
                </button>
              ))}
            </div>
          ))}
          {mine && (
            <button type="button" disabled={pending} onClick={() => set(null, null)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-sm text-au-bad hover:bg-au-bad-soft">
              Holatni tozalash
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Minutes left until Tashkent midnight. */
function minutesToMidnight() {
  const now = Date.now();
  const tz = now + 5 * 3600_000;
  const next = Math.ceil(tz / 86_400_000) * 86_400_000;
  return Math.max(5, Math.round((next - tz) / 60_000));
}

export function StatusTag({ s }: { s: ChatStatusMap[string] | undefined }) {
  if (!s) return null;
  return (
    <span title={STATUS_META[s.status].label} className="text-xs leading-none">
      {STATUS_META[s.status].emoji}
    </span>
  );
}

/* ------------------------------------------------------------ channel list */

export function ChannelList({ channels, activeId, onSelect, onNew, needle }: {
  channels: ChannelSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  needle: string;
}) {
  const shown = channels.filter((c) => !needle || c.name.toLowerCase().includes(needle));
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-[11px] font-semibold tracking-wide text-au-muted uppercase">Kanallar va guruhlar</p>
        <button type="button" onClick={onNew} aria-label="Yangi guruh" title="Yangi guruh" className="grid size-6 place-items-center rounded-md text-au-muted hover:bg-au-card-2 hover:text-au-ink">
          <Plus className="size-4" />
        </button>
      </div>
      {shown.map((c, i) => {
        const active = activeId === c.id;
        const unread = c.unread > 0 && !active;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            data-active={active}
            aria-current={active ? 'true' : undefined}
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            className={cn('ch-item tap-scale animate-fade-in-up flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors', active ? 'text-au-ink' : 'text-au-muted hover:bg-au-card-2')}
          >
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', c.announce ? 'bg-au-accent-soft text-au-accent-text' : c.kind === 'group' ? 'bg-au-info-soft text-au-info' : 'bg-au-card-2 text-au-ink')}>
              <ChannelGlyph c={c} className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5">
                <span className={cn('truncate font-semibold', unread || active ? 'text-au-ink' : 'text-au-ink/90')}>{c.name}</span>
                {c.muted && <span className="text-[10px] text-au-faint">🔕</span>}
              </span>
              <span className="truncate text-xs text-au-faint">{c.last_preview ? `${c.last_sender}: ${c.last_preview}` : (c.topic ?? 'Hali xabar yo‘q')}</span>
            </span>
            {c.mentions > 0 && !active ? (
              <span className="ms-pop-in grid h-5 min-w-5 place-items-center rounded-full bg-au-accent px-1.5 text-[11px] font-bold text-au-accent-ink">@{c.mentions}</span>
            ) : unread && !c.muted ? (
              <span className="ms-pop-in grid h-5 min-w-5 place-items-center rounded-full bg-au-ink px-1.5 text-[11px] font-bold text-white tabular-nums">{c.unread > 99 ? '99+' : c.unread}</span>
            ) : unread ? (
              <span className="size-2 rounded-full bg-au-faint" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ group dialog */

export function GroupDialog({ open, onOpenChange, staff, people, me, edit, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffDirectoryEntry[];
  people: Record<string, ChatSender>;
  me: string;
  /** Editing an existing channel (its current members for a group). */
  edit: (ChannelSummary & { members: string[] }) | null;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form each time it opens
    setName(edit?.name ?? '');
    setTopic(edit?.topic ?? '');
    setMembers(new Set((edit?.members ?? []).filter((id) => id !== me)));
    setQ('');
  }, [open, edit, me]);

  const isGroup = !edit || edit.kind === 'group';
  const needle = q.trim().toLowerCase();
  const list = staff.filter((s) => !needle || `${s.first_name} ${s.last_name}`.toLowerCase().includes(needle));

  const save = () =>
    start(async () => {
      if (edit) {
        const r = await updateChannelAction({ channelId: edit.id, name, topic, memberIds: isGroup ? [...members] : undefined });
        if (r.error) return void toast.error('Saqlab bo‘lmadi');
        toast.success('Saqlandi');
        onSaved(edit.id);
      } else {
        const r = await createChannelGroupAction({ name, topic, memberIds: [...members] });
        if (r.error || !r.id) return void toast.error('Guruh ochib bo‘lmadi');
        toast.success('Guruh ochildi');
        onSaved(r.id);
      }
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? 'Kanal sozlamalari' : 'Yangi guruh'}</DialogTitle>
          <DialogDescription>{edit ? 'Nom, mavzu va a’zolar.' : 'Loyiha yoki vazifa bo‘yicha alohida guruh — siz admin bo‘lasiz.'}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Nomi
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Masalan: Yozgi lager 2026" className="h-10 rounded-au-ctl border border-au-line bg-au-card px-3 text-sm font-normal text-au-ink focus:ring-2 focus:ring-au-accent/40 focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Mavzu (ixtiyoriy)
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="Guruh nima uchun" className="h-10 rounded-au-ctl border border-au-line bg-au-card px-3 text-sm font-normal text-au-ink focus:ring-2 focus:ring-au-accent/40 focus:outline-none" />
          </label>
          {isGroup && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-au-muted">
                <span>A’zolar · {members.size + 1}</span>
                <label className="flex items-center gap-1.5 rounded-full border border-au-line px-2 py-1">
                  <Search className="size-3" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish" className="w-24 bg-transparent font-normal text-au-ink outline-none" />
                </label>
              </div>
              <div className="flex flex-wrap gap-1">
                {[...members].map((id) => (
                  <span key={id} className="ms-pop-in inline-flex items-center gap-1 rounded-full bg-au-info-soft py-0.5 pr-1 pl-2 text-xs font-semibold text-au-info">
                    {nameOf(people[id])}
                    <button type="button" aria-label="Olib tashlash" onClick={() => setMembers((s) => new Set([...s].filter((x) => x !== id)))}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-au-line">
                {list.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-au-card-2">
                      <input
                        type="checkbox"
                        checked={members.has(s.id)}
                        onChange={() =>
                          setMembers((m) => {
                            const n = new Set(m);
                            if (n.has(s.id)) n.delete(s.id);
                            else n.add(s.id);
                            return n;
                          })
                        }
                        className="size-4 accent-[var(--au-ink)]"
                      />
                      <PersonAvatar p={people[s.id]} size={26} />
                      <span className="truncate text-sm">
                        {s.first_name} {s.last_name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {edit?.kind === 'group' && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await archiveChannelAction(edit.id);
                  if (r.error) return void toast.error('Arxivlab bo‘lmadi');
                  toast.success('Guruh arxivlandi');
                  onOpenChange(false);
                  onSaved('');
                })
              }
              className="mr-auto inline-flex items-center gap-1.5 rounded-au-ctl px-3 text-sm font-semibold text-au-bad hover:bg-au-bad-soft"
            >
              <Archive className="size-4" /> Arxivlash
            </button>
          )}
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-au-ctl border border-au-line px-4 text-sm font-semibold">
            Bekor
          </button>
          <button type="button" disabled={pending || !name.trim()} onClick={save} className="h-10 rounded-au-ctl bg-au-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
            {edit ? 'Saqlash' : 'Guruh ochish'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ info panel */

const FILE_ICON = { image: ImageIcon, video: Video, voice: Mic, file: FileText, none: FileText } as const;

export function InfoPanel({ scope, people, channel, onClose, onLeft }: {
  scope: { userId?: string; channelId?: string };
  people: Record<string, ChatSender>;
  channel: ChannelSummary | null;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [files, setFiles] = useState<ChatFile[] | null>(null);
  const [audience, setAudience] = useState<string[]>([]);
  const [tab, setTab] = useState<'media' | 'files' | 'people'>('media');
  const key = scope.userId ?? scope.channelId ?? '';

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per conversation
    setFiles(null);
    listSharedFilesAction(scope).then((f) => live && setFiles(f));
    if (scope.channelId)
      getChannelPageAction(scope.channelId).then((p) => {
        if (live && !('error' in p)) setAudience(p.audience);
      });
    else setAudience([]);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `scope` is rebuilt every render; key is its identity
  }, [key]);

  const media = (files ?? []).filter((f) => f.type === 'image' || f.type === 'video');
  const docs = (files ?? []).filter((f) => f.type !== 'image' && f.type !== 'video');
  const tabs = [
    ['media', `Media · ${media.length}`],
    ['files', `Fayllar · ${docs.length}`],
    ...(scope.channelId ? [['people', `A’zolar · ${audience.length}`]] : []),
  ] as [typeof tab, string][];

  return (
    <aside className="ms-enter-right hidden min-h-0 w-[300px] shrink-0 flex-col border-l border-au-line xl:flex">
      <div className="ch-head flex items-center gap-2 border-b border-au-line px-4 py-3">
        <h3 className="flex-1 text-sm font-bold text-au-ink">Ma’lumot</h3>
        <button type="button" aria-label="Yopish" onClick={onClose} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2">
          <X className="size-4" />
        </button>
      </div>
      {channel && (
        <div className="border-b border-au-line px-4 py-4">
          <p className="text-base font-bold text-au-ink">{channel.name}</p>
          {channel.topic && <p className="mt-1 text-xs text-au-muted">{channel.topic}</p>}
          <p className="mt-2 text-[11px] text-au-faint">
            {channel.kind === 'all' ? 'Butun jamoa' : channel.kind === 'dept' ? 'Bo‘lim kanali — a’zolik rol bo‘yicha' : 'Guruh'}
            {channel.announce && ' · faqat rahbariyat yozadi'}
          </p>
          {channel.kind === 'group' && (
            <button
              type="button"
              onClick={async () => {
                const r = await leaveChannelAction(channel.id);
                if (r.error) toast.error('Chiqib bo‘lmadi');
                else onLeft();
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-au-bad"
            >
              <LogOut className="size-3.5" /> Guruhdan chiqish
            </button>
          )}
        </div>
      )}
      <div className="flex gap-1 border-b border-au-line px-3 py-2">
        {tabs.map(([k, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-lg px-2.5 py-1 text-xs font-semibold', tab === k ? 'bg-au-card-2 text-au-ink' : 'text-au-muted hover:text-au-ink')}>
            {n}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {files === null ? (
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="aspect-square animate-pulse rounded-lg bg-au-card-2" />
            ))}
          </div>
        ) : tab === 'media' ? (
          media.length ? (
            <div className="grid grid-cols-3 gap-1.5">
              {media.map((f, i) => (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="ms-wave relative block aspect-square overflow-hidden rounded-lg bg-au-card-2" style={{ ['--i' as string]: Math.min(i, 20) }}>
                  {f.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img src={f.url} alt="" loading="lazy" className="size-full object-cover transition-transform hover:scale-105" />
                  ) : (
                    <span className="grid size-full place-items-center text-au-muted">
                      <Video className="size-5" />
                    </span>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-au-faint">Rasm yoki video yo‘q</p>
          )
        ) : tab === 'files' ? (
          docs.length ? (
            <ul className="flex flex-col gap-1">
              {docs.map((f) => {
                const Icon = FILE_ICON[f.type as keyof typeof FILE_ICON] ?? FileText;
                return (
                  <li key={f.id}>
                    <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-au-card-2">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-au-info-soft text-au-info">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-au-ink">{f.type === 'voice' ? 'Ovozli xabar' : fileNameOf(f.url)}</span>
                        <span className="block truncate text-[11px] text-au-faint">
                          {nameOf(people[f.sender_id])} · {fmtDayTime(f.at)}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-xs text-au-faint">Fayl yo‘q</p>
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            {audience.map((id) => (
              <li key={id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <PersonAvatar p={people[id]} size={28} />
                <span className="truncate text-sm">{nameOf(people[id])}</span>
              </li>
            ))}
            {audience.length === 0 && (
              <li className="flex items-center gap-2 py-6 text-xs text-au-faint">
                <Users className="size-4" /> —
              </li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------ search */

export function ChatSearch({ open, onClose, people, onPick }: {
  open: boolean;
  onClose: () => void;
  people: Record<string, ChatSender>;
  onPick: (hit: ChatSearchHit) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setHits(null);
      return;
    }
    let stale = false;
    const t = setTimeout(
      () =>
        start(async () => {
          const r = await searchChatAction(needle);
          // A newer query (or a cleared box) wins over a slow older answer.
          if (!stale) setHits(r);
        }),
      250,
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  if (!open) return null;
  const list = hits ?? [];
  const mark = (text: string) => {
    const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0) return text.slice(0, 160);
    const from = Math.max(0, i - 50);
    return (
      <>
        {from > 0 && '…'}
        {text.slice(from, i)}
        <mark className="rounded bg-au-accent-soft px-0.5 text-au-ink">{text.slice(i, i + q.trim().length)}</mark>
        {text.slice(i + q.trim().length, i + 110)}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ms-rise flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-au-line bg-au-card shadow-au-pop">
        <label className="flex items-center gap-3 border-b border-au-line px-4 py-3">
          <Search className="size-5 text-au-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(list.length - 1, i + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              }
              if (e.key === 'Enter' && list[idx]) onPick(list[idx]);
            }}
            placeholder="Barcha suhbat va kanallardan qidirish…"
            className="min-w-0 flex-1 bg-transparent text-base text-au-ink outline-none placeholder:text-au-faint"
          />
          {pending && <span className="size-4 animate-spin rounded-full border-2 border-au-line border-t-au-ink" />}
          <kbd className="rounded border border-au-line px-1.5 text-[10px] text-au-faint">Esc</kbd>
        </label>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {hits === null ? (
            <li className="px-3 py-8 text-center text-xs text-au-faint">Kamida 2 ta harf yozing</li>
          ) : list.length === 0 ? (
            <li className="px-3 py-8 text-center text-xs text-au-faint">Hech narsa topilmadi</li>
          ) : (
            list.map((h, i) => (
              <li key={`${h.kind}-${h.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => onPick(h)}
                  className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left', i === idx ? 'bg-au-card-2' : '')}
                >
                  <PersonAvatar p={people[h.sender_id]} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2 text-xs">
                      <span className="font-bold text-au-ink">{nameOf(people[h.sender_id])}</span>
                      <span className="truncate text-au-faint">{h.kind === 'channel' ? `#${h.channel_name}${h.thread_id ? ' · mavzu' : ''}` : `shaxsiy · ${nameOf(people[h.target])}`}</span>
                      <span className="ml-auto shrink-0 text-au-faint">{fmtDayTime(h.at)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-au-muted">{mark(h.text)}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
