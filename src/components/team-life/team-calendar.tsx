'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Link2, Loader2, MapPin, Pencil, RefreshCw, Smartphone, Trash2, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_NEUTRAL, INPUT, SURFACE_CARD } from '@/lib/glass';
import {
  calendarTokenAction,
  deleteEventAction,
  getCalendarAction,
  respondEventAction,
  restoreEventAction,
  revokeCalendarTokenAction,
  saveEventAction,
} from '@/lib/actions/team-life';
import { EVENT_KIND_LABEL, EVENT_KINDS, LAYER_META, LAYERS, type CalEvent, type EventKind, type Layer } from '@/lib/team-life';

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3 h-8 text-xs font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const DOW = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const LS_KEY = 'team-cal-layers';

function addDays(k: string, n: number) {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const mondayOf = (k: string) => addDays(k, -((new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7));

type View = 'month' | 'week' | 'list';

function rangeFor(view: View, anchor: string): { from: string; to: string } {
  if (view === 'week') {
    const a = mondayOf(anchor);
    return { from: a, to: addDays(a, 6) };
  }
  if (view === 'list') return { from: anchor, to: addDays(anchor, 41) };
  const first = `${anchor.slice(0, 7)}-01`;
  const a = mondayOf(first);
  return { from: a, to: addDays(a, 41) };
}

const covers = (e: CalEvent, day: string) => e.day <= day && (e.endDay ?? e.day) >= day;

type EventDraft = { id?: string; title: string; description: string; day: string; time: string; endDay: string; location: string; kind: EventKind; repeat: 'none' | 'weekly' | 'monthly' | 'yearly'; repeatUntil?: string | null; notify: boolean };

export function TeamCalendar({ initial, today, canPublish, canAll }: { initial: CalEvent[]; today: string; canPublish: boolean; canAll: boolean }) {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(today);
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [events, setEvents] = useState(initial);
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(LAYERS));
  const [sel, setSel] = useState<string>(today);
  const [openEv, setOpenEv] = useState<CalEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [feed, setFeed] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [busy, start] = useTransition();
  const req = useRef(0);

  // Restore the viewer's layer choice (per device).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a per-device preference
      if (raw) setLayers(new Set((JSON.parse(raw) as Layer[]).filter((l) => (LAYERS as readonly string[]).includes(l))));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleLayer = (l: Layer) => {
    const next = new Set(layers);
    if (next.has(l)) next.delete(l);
    else next.add(l);
    setLayers(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const load = (v: View, a: string, s: 'mine' | 'all') =>
    startLoad(async () => {
      const id = ++req.current;
      const { from, to } = rangeFor(v, a);
      const res = await getCalendarAction(from, to, s);
      if (id !== req.current) return;
      if (res.error !== undefined) return void toast.error('Kalendarni yuklab bo‘lmadi');
      setEvents(res.events);
    });

  const go = (v: View, a: string, s = scope) => {
    setView(v);
    setAnchor(a);
    load(v, a, s);
  };
  const step = (n: number) => {
    if (view === 'month') {
      const [y, m] = anchor.split('-').map(Number);
      const t = y * 12 + (m - 1) + n;
      go(view, `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`);
    } else go(view, addDays(anchor, n * (view === 'week' ? 7 : 42)));
  };

  const visible = useMemo(() => events.filter((e) => layers.has(e.layer)), [events, layers]);
  const { from } = rangeFor(view, anchor);
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const dayEvents = (d: string) => visible.filter((e) => covers(e, d));
  const title =
    view === 'month'
      ? `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`
      : view === 'week'
        ? `${from.slice(8)}.${from.slice(5, 7)} — ${addDays(from, 6).slice(8)}.${addDays(from, 6).slice(5, 7)}`
        : `${from} dan 6 hafta`;

  const rsvp = (e: CalEvent, r: 'yes' | 'no' | 'maybe') =>
    start(async () => {
      if (!e.eventId) return;
      const next = e.rsvp?.mine === r ? null : r;
      const res = await respondEventAction(e.eventId, next);
      if (res.error !== undefined) return void toast.error('Saqlab bo‘lmadi');
      const upd = (x: CalEvent) => {
        if (x.eventId !== e.eventId || !x.rsvp) return x;
        const c = { ...x.rsvp };
        if (c.mine) c[c.mine]--;
        if (next) c[next]++;
        return { ...x, rsvp: { ...c, mine: next } };
      };
      setEvents((l) => l.map(upd));
      setOpenEv((o) => (o ? upd(o) : o));
    });

  const saveEvent = () =>
    draft &&
    start(async () => {
      const res = await saveEventAction({
        id: draft.id,
        title: draft.title,
        description: draft.description,
        day: draft.day,
        time: draft.time || null,
        endDay: draft.endDay || null,
        location: draft.location,
        kind: draft.kind,
        repeat: draft.repeat,
        repeatUntil: draft.repeatUntil ?? null,
        notify: draft.notify,
      });
      if (res.error !== undefined) return void toast.error('Saqlab bo‘lmadi — maydonlarni tekshiring');
      toast.success(draft.id ? 'Tadbir yangilandi' : 'Tadbir qo‘shildi');
      setDraft(null);
      load(view, anchor, scope);
    });

  const delEvent = (e: CalEvent) =>
    start(async () => {
      if (!e.eventId) return;
      const res = await deleteEventAction(e.eventId);
      if (res.error !== undefined) return void toast.error('O‘chirib bo‘lmadi');
      setOpenEv(null);
      setEvents((l) => l.filter((x) => x.eventId !== e.eventId));
      toast.success('Tadbir o‘chirildi', {
        duration: 6000,
        action: { label: 'Bekor qilish', onClick: () => void restoreEventAction(e.eventId!).then(() => load(view, anchor, scope)) },
      });
    });

  const feedLink = (rotate: boolean) =>
    start(async () => {
      const res = await calendarTokenAction(rotate);
      if (res.error !== undefined) return void toast.error('Havolani yaratib bo‘lmadi');
      setFeed(`${location.origin}/staff/api/calendar/${res.token}.ics`);
      if (rotate) toast.success('Yangi havola yaratildi — eskisi endi ishlamaydi');
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className={cn(SURFACE_CARD, 'ms-rise flex min-w-0 flex-col gap-3 p-3 sm:p-4')}>
        <div className="flex flex-wrap items-center gap-2">
          <button className={BTN_GHOST} onClick={() => step(-1)} aria-label="Oldingi">
            <ChevronLeft className="size-4" />
          </button>
          <button className={BTN_GHOST} onClick={() => go(view, today)}>
            Bugun
          </button>
          <button className={BTN_GHOST} onClick={() => step(1)} aria-label="Keyingi">
            <ChevronRight className="size-4" />
          </button>
          <h2 className="min-w-40 text-lg font-bold">{title}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-au-muted" />}
          <div className="ml-auto flex flex-wrap gap-1.5">
            <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5">
              {(
                [
                  ['month', 'Oy'],
                  ['week', 'Hafta'],
                  ['list', 'Ro‘yxat'],
                ] as [View, string][]
              ).map(([v, n]) => (
                <button key={v} onClick={() => go(v, v === 'month' ? `${anchor.slice(0, 7)}-01` : anchor)} className={cn('h-7 rounded-[8px] px-2.5 text-xs font-semibold', view === v ? 'bg-au-card shadow-au-card' : 'text-au-muted')}>
                  {n}
                </button>
              ))}
            </div>
            {canAll && (
              <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5">
                {(
                  [
                    ['all', 'Jamoa'],
                    ['mine', 'Men'],
                  ] as ['all' | 'mine', string][]
                ).map(([s, n]) => (
                  <button
                    key={s}
                    onClick={() => {
                      setScope(s);
                      load(view, anchor, s);
                    }}
                    className={cn('h-7 rounded-[8px] px-2.5 text-xs font-semibold', scope === s ? 'bg-au-card shadow-au-card' : 'text-au-muted')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {canPublish && (
              <button className={BTN_PRIMARY} onClick={() => setDraft({ title: '', description: '', day: sel, time: '', endDay: '', location: '', kind: 'company', repeat: 'none', notify: true })}>
                <CalendarPlus className="size-3.5" /> Tadbir
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {LAYERS.map((l) => (
            <button
              key={l}
              onClick={() => toggleLayer(l)}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition', layers.has(l) ? 'bg-au-card-2 text-au-ink' : 'text-au-muted line-through opacity-60')}
            >
              <i className="size-2 rounded-full" style={{ background: LAYER_META[l].c }} />
              {LAYER_META[l].n}
            </button>
          ))}
        </div>

        {view === 'list' ? (
          <ol className="flex flex-col gap-3">
            {days
              .filter((d) => dayEvents(d).length)
              .map((d) => (
                <li key={d} className="flex gap-3">
                  <span className={cn('w-14 shrink-0 text-center', d === today && 'font-bold text-au-accent-text')}>
                    <b className="block text-xl tabular-nums">{d.slice(8)}</b>
                    <span className="text-[10px] text-au-muted uppercase">
                      {DOW[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]} · {MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {dayEvents(d).map((e) => (
                      <Pill key={e.id + d} e={e} onClick={() => setOpenEv(e)} wide />
                    ))}
                  </div>
                </li>
              ))}
            {!days.some((d) => dayEvents(d).length) && <p className="py-8 text-center text-sm text-au-muted">Bu davrda voqea yo‘q</p>}
          </ol>
        ) : (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-au-ctl border border-au-line bg-au-line">
            {DOW.map((d) => (
              <div key={d} className="bg-au-card-2 py-1.5 text-center text-[11px] font-bold text-au-muted">
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              const evs = dayEvents(d);
              const out = view === 'month' && d.slice(0, 7) !== anchor.slice(0, 7);
              const max = view === 'week' ? 12 : 3;
              return (
                <button
                  key={d}
                  onClick={() => setSel(d)}
                  style={{ ['--i' as string]: Math.min(i, 20) }}
                  className={cn(
                    'ms-rise flex flex-col gap-0.5 bg-au-card p-1 text-left transition hover:bg-au-card-2',
                    view === 'week' ? 'min-h-64' : 'min-h-[88px]',
                    out && 'opacity-45',
                    sel === d && 'ring-2 ring-inset ring-au-accent',
                  )}
                >
                  <span className={cn('grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums', d === today ? 'bg-au-accent text-au-accent-ink' : 'text-au-muted')}>
                    {Number(d.slice(8))}
                  </span>
                  {evs.slice(0, max).map((e) => (
                    <Pill key={e.id + d} e={e} onClick={() => setOpenEv(e)} />
                  ))}
                  {evs.length > max && <span className="px-1 text-[10px] font-semibold text-au-muted">+{evs.length - max} yana</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        {draft ? (
          <EventForm draft={draft} setDraft={setDraft} busy={busy} onSave={saveEvent} />
        ) : openEv ? (
          <section className={cn(SURFACE_CARD, 'ms-pop-in flex flex-col gap-3 p-4')}>
            <div className="flex items-start gap-2">
              <i className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: LAYER_META[openEv.layer].c }} />
              <h3 className={cn(CARD_TITLE, 'flex-1')}>{openEv.title}</h3>
              <button onClick={() => setOpenEv(null)} className="text-au-muted hover:text-au-ink" aria-label="Yopish">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-au-muted">
              {openEv.day}
              {openEv.endDay && openEv.endDay !== openEv.day ? ` — ${openEv.endDay}` : ''}
              {openEv.time ? ` · ${openEv.time}` : ''} · {LAYER_META[openEv.layer].n}
            </p>
            {openEv.meta && (
              <p className="flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-au-muted" />
                {openEv.meta}
              </p>
            )}
            {openEv.rsvp && (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  {(
                    [
                      ['yes', 'Boraman'],
                      ['maybe', 'Balki'],
                      ['no', 'Bormayman'],
                    ] as const
                  ).map(([r, n]) => (
                    <button
                      key={r}
                      disabled={busy}
                      onClick={() => rsvp(openEv, r)}
                      className={cn(BTN, 'flex-1', openEv.rsvp?.mine === r ? (r === 'no' ? 'bg-au-bad text-white' : 'bg-au-ok text-white') : 'border border-au-line bg-au-card')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-au-muted">
                  {openEv.rsvp.yes} boradi · {openEv.rsvp.maybe} balki · {openEv.rsvp.no} bormaydi
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {openEv.href && (
                <Link href={openEv.href} className={BTN_GHOST}>
                  Ochish
                </Link>
              )}
              {openEv.editable && openEv.eventId && (
                <>
                  <button
                    className={BTN_GHOST}
                    onClick={() => {
                      setDraft({
                        id: openEv.eventId,
                        title: openEv.title,
                        description: openEv.raw?.description ?? '',
                        day: openEv.day,
                        time: openEv.time ?? '',
                        endDay: openEv.endDay ?? '',
                        location: openEv.raw?.location ?? '',
                        kind: openEv.raw?.kind ?? 'company',
                        repeat: openEv.raw?.repeat ?? 'none',
                        repeatUntil: openEv.raw?.repeatUntil ?? null,
                        notify: false,
                      });
                      setOpenEv(null);
                    }}
                  >
                    <Pencil className="size-3.5" /> Tahrirlash
                  </button>
                  <button className={cn(BTN_GHOST, 'hover:text-au-bad')} disabled={busy} onClick={() => delEvent(openEv)}>
                    <Trash2 className="size-3.5" /> O‘chirish
                  </button>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-2 p-4')}>
            <h3 className={CARD_TITLE}>
              {sel === today ? 'Bugun' : sel} · {dayEvents(sel).length} voqea
            </h3>
            {dayEvents(sel).length === 0 ? (
              <p className="text-sm text-au-muted">Bu kunda voqea yo‘q</p>
            ) : (
              dayEvents(sel).map((e) => <Pill key={e.id} e={e} onClick={() => setOpenEv(e)} wide />)
            )}
          </section>
        )}

        <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-2 p-4')} style={{ ['--i' as string]: 2 }}>
          <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
            <Smartphone className="size-4 text-au-muted" /> Telefon kalendariga ulash
          </h3>
          <p className="text-[11px] text-au-muted">Shaxsiy havola: tadbirlar, vazifa muddatlaringiz, ta’tillar va tug‘ilgan kunlar Google / iPhone kalendarida avtomatik ko‘rinadi.</p>
          {feed ? (
            <div className="flex flex-col gap-1.5">
              <code className="rounded-au-ctl bg-au-card-2 px-2 py-1.5 text-[11px] break-all">{feed}</code>
              <div className="flex flex-wrap gap-1.5">
                <button className={BTN_GHOST} onClick={() => navigator.clipboard.writeText(feed).then(() => toast.success('Nusxa olindi'))}>
                  <Copy className="size-3.5" /> Nusxa
                </button>
                <button className={BTN_GHOST} disabled={busy} onClick={() => feedLink(true)}>
                  <RefreshCw className="size-3.5" /> Yangilash
                </button>
                <button
                  className={cn(BTN_GHOST, 'hover:text-au-bad')}
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      await revokeCalendarTokenAction();
                      setFeed(null);
                      toast.success('Havola o‘chirildi');
                    })
                  }
                >
                  O‘chirish
                </button>
              </div>
            </div>
          ) : (
            <button className={BTN_GHOST} disabled={busy} onClick={() => feedLink(false)}>
              <Link2 className="size-3.5" /> Havolani olish
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}

function Pill({ e, onClick, wide }: { e: CalEvent; onClick: () => void; wide?: boolean }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      onKeyDown={(ev) => ev.key === 'Enter' && onClick()}
      title={e.title}
      className={cn(
        'flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] leading-5 font-semibold transition hover:brightness-95',
        wide ? 'py-1 text-xs' : '',
      )}
      style={{ background: `color-mix(in oklab, ${LAYER_META[e.layer].c} 16%, transparent)` }}
    >
      <i className="size-1.5 shrink-0 rounded-full" style={{ background: LAYER_META[e.layer].c }} />
      {e.time && <span className="shrink-0 tabular-nums opacity-70">{e.time}</span>}
      <span className="truncate">{e.title}</span>
      {wide && e.rsvp?.mine && <span className={cn(CHIP_NEUTRAL, 'ml-auto h-5')}>{e.rsvp.mine === 'yes' ? 'Boraman' : e.rsvp.mine === 'no' ? 'Yo‘q' : 'Balki'}</span>}
    </span>
  );
}

function EventForm({ draft, setDraft, busy, onSave }: { draft: EventDraft; setDraft: (d: EventDraft | null) => void; busy: boolean; onSave: () => void }) {
  const set = (p: Partial<EventDraft>) => setDraft({ ...draft, ...p });
  return (
    <section className={cn(SURFACE_CARD, 'ms-pop-in flex flex-col gap-2 p-4')}>
      <h3 className={CARD_TITLE}>{draft.id ? 'Tadbirni tahrirlash' : 'Yangi tadbir'}</h3>
      <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Nomi" className={INPUT} maxLength={160} />
      <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as EventKind })} className={cn(INPUT, 'h-9')}>
        {EVENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {EVENT_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Sana
          <input type="date" value={draft.day} onChange={(e) => set({ day: e.target.value })} className={cn(INPUT, 'h-9')} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Vaqt (bo‘sh = kun bo‘yi)
          <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} className={cn(INPUT, 'h-9')} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Tugash sanasi
          <input type="date" value={draft.endDay} min={draft.day} onChange={(e) => set({ endDay: e.target.value })} className={cn(INPUT, 'h-9')} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
          Takrorlanish
          <select value={draft.repeat} onChange={(e) => set({ repeat: e.target.value as EventDraft['repeat'] })} className={cn(INPUT, 'h-9')}>
            <option value="none">Yo‘q</option>
            <option value="weekly">Har hafta</option>
            <option value="monthly">Har oy</option>
            <option value="yearly">Har yili</option>
          </select>
        </label>
      </div>
      <input value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Joy (ixtiyoriy)" className={INPUT} />
      <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={3} placeholder="Tavsif (ixtiyoriy)" className={cn(INPUT, 'py-2')} />
      {!draft.id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.notify} onChange={(e) => set({ notify: e.target.checked })} /> Jamoaga Telegram orqali xabar berish
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button className={BTN_GHOST} onClick={() => setDraft(null)}>
          Bekor
        </button>
        <button className={BTN_PRIMARY} disabled={busy || !draft.title.trim() || !draft.day} onClick={onSave}>
          Saqlash
        </button>
      </div>
    </section>
  );
}
