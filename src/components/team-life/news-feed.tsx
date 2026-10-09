'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { BellRing, CalendarClock, CheckCheck, Eye, Megaphone, Pencil, Pin, PinOff, Plus, Send, Trash2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_ACCENT, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import {
  ackNewsAction,
  deleteNewsSoftAction,
  getNewsAudienceAction,
  reactNewsAction,
  remindUnackedAction,
  restoreNewsAction,
  saveNewsAction,
  togglePinNewsAction,
} from '@/lib/actions/team-life';
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABEL, NEWS_TEMPLATES, type NewsCategory } from '@/lib/team-life';
import type { FeedNews } from '@/lib/team-life-data';

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3 h-8 text-xs font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
const EMOJI = ['👍', '❤️', '🎉', '👏', '🙏'];
const AUD: [string, string][] = [
  ['all', 'Hamma'],
  ['top', 'Rahbariyat'],
  ['acad', 'Akademik'],
  ['com', 'Tijorat'],
  ['ops', 'Operatsiya'],
  ['fin', 'Moliya'],
  ['hr', 'HR'],
];
const fmt = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
const errText = (c: string) => ({ forbidden: 'Ruxsat yo‘q', invalidInput: 'Ma’lumotni tekshiring', notFound: 'Topilmadi' } as Record<string, string>)[c] ?? 'Saqlab bo‘lmadi';

type Draft = {
  id?: string;
  title: string;
  content: string;
  category: NewsCategory;
  pinned: boolean;
  mustAck: boolean;
  audience: string;
  publishAt: string; // local 'YYYY-MM-DDTHH:MM' (Tashkent) or ''
  notify: boolean;
  imageUrl: string;
};
const EMPTY: Draft = { title: '', content: '', category: 'general', pinned: false, mustAck: false, audience: 'all', publishAt: '', notify: true, imageUrl: '' };

export function NewsFeed({ initial, audience, isAdmin, me }: { initial: FeedNews[]; audience: number; isAdmin: boolean; me: string }) {
  const router = useRouter();
  const [news, setNews] = useState(initial);
  const [cat, setCat] = useState<NewsCategory | 'all' | 'unacked'>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [panel, setPanel] = useState<{ id: string; acked: string[]; read: string[]; pending: string[] } | null>(null);
  const [busy, start] = useTransition();

  const shown = useMemo(
    () => news.filter((n) => (cat === 'all' ? true : cat === 'unacked' ? n.must_ack && !n.acked : n.category === cat)),
    [news, cat],
  );
  const unacked = news.filter((n) => n.must_ack && !n.acked).length;

  const save = () =>
    draft &&
    start(async () => {
      const res = await saveNewsAction({
        id: draft.id,
        title: draft.title,
        content: draft.content,
        category: draft.category,
        pinned: draft.pinned,
        mustAck: draft.mustAck,
        audience: draft.audience as 'all',
        publishAt: draft.publishAt ? new Date(`${draft.publishAt}:00+05:00`).toISOString() : null,
        notify: draft.notify,
        imageUrl: draft.imageUrl.trim(),
      });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(draft.id ? 'E’lon yangilandi' : draft.publishAt ? 'E’lon rejalashtirildi' : 'E’lon chop etildi');
      setDraft(null);
      router.refresh();
    });

  const del = (n: FeedNews) =>
    start(async () => {
      const res = await deleteNewsSoftAction(n.id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setNews((l) => l.filter((x) => x.id !== n.id));
      toast.success('E’lon o‘chirildi', {
        duration: 6000,
        action: {
          label: 'Bekor qilish',
          onClick: () =>
            void restoreNewsAction(n.id).then((r) => {
              if (r.error === undefined) setNews((l) => [n, ...l]);
            }),
        },
      });
    });

  const ack = (n: FeedNews) =>
    start(async () => {
      const res = await ackNewsAction(n.id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setNews((l) => l.map((x) => (x.id === n.id ? { ...x, acked: true, acks: x.acks + 1 } : x)));
    });

  const react = (n: FeedNews, emoji: string) => {
    setNews((l) =>
      l.map((x) => {
        if (x.id !== n.id) return x;
        const has = x.reactions.find((r) => r.emoji === emoji);
        const reactions = has
          ? x.reactions.map((r) => (r.emoji === emoji ? { ...r, n: r.n + (r.mine ? -1 : 1), mine: !r.mine } : r)).filter((r) => r.n > 0)
          : [...x.reactions, { emoji, n: 1, mine: true }];
        return { ...x, reactions };
      }),
    );
    void reactNewsAction(n.id, emoji).then((r) => r.error !== undefined && toast.error(errText(r.error)));
  };

  const pin = (n: FeedNews) =>
    start(async () => {
      const res = await togglePinNewsAction(n.id, !n.pinned);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setNews((l) => l.map((x) => (x.id === n.id ? { ...x, pinned: !n.pinned } : x)).sort((a, b) => Number(b.pinned) - Number(a.pinned)));
    });

  const openPanel = (n: FeedNews) =>
    start(async () => {
      const res = await getNewsAudienceAction(n.id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setPanel({ id: n.id, acked: res.acked, read: res.read, pending: res.pending });
    });

  const remind = (id: string) =>
    start(async () => {
      const res = await remindUnackedAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(`${res.sent} kishiga eslatma yuborildi`);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', ...NEWS_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn('h-8 rounded-full px-3 text-xs font-semibold transition', cat === c ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
          >
            {c === 'all' ? 'Hammasi' : NEWS_CATEGORY_LABEL[c]}
          </button>
        ))}
        {unacked > 0 && (
          <button onClick={() => setCat('unacked')} className={cn('h-8 rounded-full px-3 text-xs font-semibold', cat === 'unacked' ? 'bg-au-bad text-white' : 'bg-au-bad-soft text-au-bad')}>
            Tanishishim kerak · {unacked}
          </button>
        )}
        {isAdmin && !draft && (
          <button className={cn(BTN_PRIMARY, 'ml-auto h-9')} onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="size-4" /> Yangi e’lon
          </button>
        )}
      </div>

      {draft && <Composer draft={draft} setDraft={setDraft} busy={busy} onSave={save} />}

      {shown.length === 0 && <p className={cn(SURFACE_CARD, 'p-6 text-center text-sm text-au-muted')}>E’lon yo‘q</p>}

      {shown.map((n, i) => (
        <article
          key={n.id}
          style={{ ['--i' as string]: Math.min(i, 10) }}
          className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4 sm:p-5', n.must_ack && !n.acked && 'ring-2 ring-au-bad/40', n.scheduled && 'opacity-80')}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {n.pinned && (
              <span className={CHIP_ACCENT}>
                <Pin className="size-3" /> Mahkamlangan
              </span>
            )}
            <span className={CHIP_NEUTRAL}>{NEWS_CATEGORY_LABEL[n.category] ?? n.category}</span>
            {n.audience !== 'all' && <span className={CHIP_INFO}>{AUD.find(([k]) => k === n.audience)?.[1]}</span>}
            {n.must_ack && (
              <span className={n.acked ? CHIP_OK : CHIP_BAD}>
                <Megaphone className="size-3" /> {n.acked ? 'Tanishgansiz' : 'Muhim'}
              </span>
            )}
            {n.scheduled && n.publish_at && (
              <span className={CHIP_INFO}>
                <CalendarClock className="size-3" /> {fmt(n.publish_at)} da chiqadi
              </span>
            )}
            <span className="ml-auto text-[11px] text-au-muted">
              {n.author ?? 'Rahbariyat'} · {fmt(n.publish_at ?? n.created_at)}
            </span>
          </div>
          <h3 className={cn(CARD_TITLE, 'text-lg')}>{n.title}</h3>
          {n.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- external https image chosen by the author
            <img src={n.image_url} alt="" className="max-h-80 w-full rounded-au-ctl object-cover" />
          )}
          <p className="text-sm whitespace-pre-wrap">{n.content}</p>

          {n.must_ack && !n.acked && !n.scheduled && (
            <button className={cn(BTN, 'h-10 w-full bg-au-bad text-sm text-white sm:w-fit')} disabled={busy} onClick={() => ack(n)}>
              <CheckCheck className="size-4" /> Tanishdim
            </button>
          )}

          <div className="flex flex-wrap items-center gap-1.5 border-t border-au-line pt-3">
            {EMOJI.map((e) => {
              const r = n.reactions.find((x) => x.emoji === e);
              return (
                <button
                  key={e}
                  onClick={() => react(n, e)}
                  className={cn('inline-flex h-7 items-center gap-1 rounded-full px-2 text-sm transition', r?.mine ? 'bg-au-accent-soft' : 'bg-au-card-2 opacity-70 hover:opacity-100')}
                >
                  {e}
                  {r && <span className="text-[11px] font-semibold tabular-nums">{r.n}</span>}
                </button>
              );
            })}
            {(isAdmin || n.created_by === me) && (
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                <button className={BTN_GHOST} onClick={() => openPanel(n)} title="Kim o‘qidi">
                  <Eye className="size-3.5" /> {n.reads}/{audience}
                  {n.must_ack && <span className="text-au-muted"> · ✓{n.acks}</span>}
                </button>
                {isAdmin && (
                  <button className={BTN_GHOST} onClick={() => pin(n)} aria-label={n.pinned ? 'Yechish' : 'Mahkamlash'}>
                    {n.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </button>
                )}
                <button
                  className={BTN_GHOST}
                  onClick={() =>
                    setDraft({
                      id: n.id,
                      title: n.title,
                      content: n.content,
                      category: n.category,
                      pinned: n.pinned,
                      mustAck: n.must_ack,
                      audience: n.audience,
                      publishAt: n.scheduled && n.publish_at ? fmt(n.publish_at).replace(' ', 'T') : '',
                      notify: false,
                      imageUrl: n.image_url ?? '',
                    })
                  }
                  aria-label="Tahrirlash"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button className={cn(BTN_GHOST, 'hover:text-au-bad')} onClick={() => del(n)} aria-label="O‘chirish">
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            )}
          </div>

          {panel?.id === n.id && (
            <div className="ms-pop-in grid gap-3 rounded-au-ctl border border-au-line bg-au-card-2 p-3 text-xs sm:grid-cols-3">
              {[
                ['Tasdiqladi', panel.acked, 'text-au-ok'],
                ['Faqat o‘qidi', panel.read, 'text-au-info'],
                ['O‘qimagan', panel.pending, 'text-au-bad'],
              ].map(([t, list, c]) => (
                <div key={t as string} className="flex flex-col gap-1">
                  <b className={c as string}>
                    {t as string} · {(list as string[]).length}
                  </b>
                  <span className="text-au-muted">{(list as string[]).join(', ') || '—'}</span>
                </div>
              ))}
              <div className="col-span-full flex justify-end gap-2">
                {n.must_ack && isAdmin && panel.pending.length + panel.read.length > 0 && (
                  <button className={BTN_PRIMARY} disabled={busy} onClick={() => remind(n.id)}>
                    <BellRing className="size-3.5" /> Tanishmaganlarga eslatma
                  </button>
                )}
                <button className={BTN_GHOST} onClick={() => setPanel(null)}>
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Composer({ draft, setDraft, busy, onSave }: { draft: Draft; setDraft: (d: Draft | null) => void; busy: boolean; onSave: () => void }) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  return (
    <section className={cn(SURFACE_CARD, 'ms-pop-in flex flex-col gap-3 p-4 sm:p-5')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="mr-1 text-sm">{draft.id ? 'E’lonni tahrirlash' : 'Yangi e’lon'}</b>
        {!draft.id &&
          NEWS_TEMPLATES.map((t) => (
            <button key={t.n} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')} onClick={() => set({ title: t.title, content: t.content, category: t.category, mustAck: t.mustAck })}>
              {t.n}
            </button>
          ))}
      </div>
      <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Sarlavha" className={cn(INPUT, 'text-base font-semibold')} maxLength={200} />
      <textarea value={draft.content} onChange={(e) => set({ content: e.target.value })} rows={6} placeholder="Matn" className={cn(INPUT, 'py-2')} maxLength={8000} />
      <input value={draft.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="Rasm havolasi (https://…, ixtiyoriy)" className={INPUT} />
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Toifa
          <select value={draft.category} onChange={(e) => set({ category: e.target.value as NewsCategory })} className={cn(INPUT, 'h-9')}>
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NEWS_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Kimlar uchun
          <select value={draft.audience} onChange={(e) => set({ audience: e.target.value })} className={cn(INPUT, 'h-9')}>
            {AUD.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Chiqish vaqti (bo‘sh = hozir)
          <input type="datetime-local" value={draft.publishAt} onChange={(e) => set({ publishAt: e.target.value })} className={cn(INPUT, 'h-9')} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.mustAck} onChange={(e) => set({ mustAck: e.target.checked })} /> Muhim — “Tanishdim” majburiy
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.pinned} onChange={(e) => set({ pinned: e.target.checked })} /> Tepaga mahkamlash
        </label>
        {!draft.id && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.notify} onChange={(e) => set({ notify: e.target.checked })} /> Telegram’ga yuborish
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button className={BTN_GHOST} onClick={() => setDraft(null)}>
          Bekor
        </button>
        <button className={cn(BTN_PRIMARY, 'h-9 px-4 text-sm')} disabled={busy || !draft.title.trim() || !draft.content.trim()} onClick={onSave}>
          <Send className="size-4" /> {draft.id ? 'Saqlash' : draft.publishAt ? 'Rejalashtirish' : 'Chop etish'}
        </button>
      </div>
    </section>
  );
}
