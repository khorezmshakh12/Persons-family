'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Archive, Mail, Plus, Search, Send, Settings2, Tags } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { SalesLead } from '@/lib/ops-sales';
import { moveLeadAction } from '@/lib/actions/sales';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { ago, tsDate } from './ops-students-meta';
import { GROUP_TONE, LOST_FIX, TELEGRAM_COL, columnOf, daysInStage, firstOpenStage, isWaiting, leadErr, sourceName } from './ops-sales-meta';
import { LeadDrawer } from './ops-lead-card';
import { AddLeadModal, ArchiveModal, GroupsModal, StagesModal } from './ops-sales-admin';
import { TemplatesModal } from './ops-student-admin';

type Col = { id: string; name: string; kind: string };

/**
 * Operation HQ › Sales (2026-10-22): the CRM leads as a kanban. Bot leads land
 * in «Telegram»; cards drag between stages (mouse, or press-and-hold on a
 * phone); newest on top. A card opens the lead: edit, comments, Telegram
 * message, convert to a student.
 */
export function OpsSales({ data, openId, onOpenChange }: { data: OpsData; openId: string | null; onOpenChange: (id: string | null) => void }) {
  const d = data.sales;
  const router = useRouter();
  const [, start] = useTransition();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [mine, setMine] = useState(false);
  const [moved, setMoved] = useState<Record<string, string | null>>({});
  const [lostAsk, setLostAsk] = useState<{ id: string; sectionId: string } | null>(null);
  const [modal, setModal] = useState<'add' | 'groups' | 'stages' | 'tpl' | 'archive' | null>(null);
  const [now] = useState(() => Date.now());
  const first = firstOpenStage(d);

  // Optimistic moves until the refreshed data arrives.
  const leads = useMemo(() => d.leads.map((l) => (l.id in moved ? { ...l, sectionId: moved[l.id] } : l)), [d.leads, moved]);
  const cols: Col[] = [{ id: TELEGRAM_COL, name: 'Telegram', kind: 'telegram' }, ...d.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))];

  const visible = (l: SalesLead) => {
    if (mine && l.ownerId !== data.meId) return false;
    if (group === 'none' ? l.groupId : group !== 'all' && l.groupId !== group) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const digits = t.replace(/\D/g, '');
    return l.name.toLowerCase().includes(t) || l.course.toLowerCase().includes(t) || (digits.length >= 3 && l.phone.replace(/\D/g, '').includes(digits));
  };

  const move = (id: string, colId: string) => {
    const l = leads.find((x) => x.id === id);
    if (!l || columnOf(l, first) === colId) return;
    if (colId === TELEGRAM_COL && l.source !== 'telegram') {
      toast.error('«Telegram» ustuniga faqat botdan kelgan lidlar qaytadi');
      return;
    }
    const col = cols.find((c) => c.id === colId);
    if (col?.kind === 'lost') {
      setLostAsk({ id, sectionId: colId });
      return;
    }
    if (col?.kind === 'joined' && !l.studentId) {
      onOpenChange(id);
      toast.message('O‘quvchiga aylantirish uchun oylik summa va sanani kiriting');
      return;
    }
    const sectionId = colId === TELEGRAM_COL ? null : colId;
    setMoved((m) => ({ ...m, [id]: sectionId }));
    start(async () => {
      const r = await moveLeadAction({ id, sectionId });
      if (r.error) {
        setMoved((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
        playSound('err');
        toast.error(leadErr(r.error));
        return;
      }
      playSound('ok');
      toast.success(`«${col?.name}» ga o‘tkazildi`);
      router.refresh();
    });
  };

  const drag = useBoardDrag(move);
  const open = openId ? leads.find((l) => l.id === openId) : undefined;

  // Stats.
  const today = data.today.day;
  const newToday = leads.filter((l) => now - tsDate(l.createdAt).getTime() < 86_400_000).length;
  const waiting = leads.filter((l) => isWaiting(l, now));
  const trialsToday = leads.filter((l) => l.trialDate === today && !l.studentId).length;
  const won = leads.filter((l) => l.studentId).length;
  const lost = leads.filter((l) => l.lostReason).length;
  const tgWeek = leads.filter((l) => l.source === 'telegram' && now - tsDate(l.createdAt).getTime() < 7 * 86_400_000).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="sx-grid">
        <div className="sx-card sx-stat dark s3">
          <div className="l">Oxirgi 24 soatda yangi lid</div>
          <div className="v">{newToday}</div>
          <div className="d">Telegram botdan haftada {tgWeek} ta</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Javob kutmoqda</div>
          <div className={cn('v', waiting.length > 0 && 'text-au-bad')}>{waiting.length}</div>
          <div className="d">15 daqiqadan ko‘p bog‘lanilmagan</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Bugungi sinov darslari</div>
          <div className="v">{trialsToday}</div>
          <div className="d">{leads.filter((l) => l.trialDate && l.trialDate > today && !l.studentId).length} tasi keyingi kunlarda</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Konversiya (60 kun)</div>
          <div className="v">{won + lost ? Math.round((won / (won + lost)) * 100) : 0}%</div>
          <div className="d">
            {won} o‘quvchi · {lost} rad etdi
          </div>
        </div>
      </div>

      <div className="sx-card flex flex-col gap-3 px-5 py-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          {data.canEdit && (
            <button className="sx-btn primary" onClick={() => setModal('add')}>
              <Plus className="size-4" /> Lid qo‘shish
            </button>
          )}
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-au-faint" />
            <input id="sales-q" className="sx-inp !w-[230px] !pl-8" placeholder="Ism, telefon yoki kurs" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-au-muted">
            <input id="sales-mine" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mening lidlarim
          </label>
          <span className="flex-1" />
          {data.canEdit && (
            <>
              <button className="sx-btn sm" onClick={() => setModal('groups')}>
                <Tags className="size-4" /> Guruhlar
              </button>
              <button className="sx-btn sm" onClick={() => setModal('stages')}>
                <Settings2 className="size-4" /> Bosqichlar
              </button>
              <button className="sx-btn sm" onClick={() => setModal('tpl')}>
                <Mail className="size-4" /> Xabar shablonlari
              </button>
            </>
          )}
          <button className="sx-btn sm" onClick={() => setModal('archive')}>
            <Archive className="size-4" /> Arxiv · {d.archived.length}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-au-faint">Guruhlar:</span>
          <Chip on={group === 'all'} onClick={() => setGroup('all')}>
            Hammasi · {leads.length}
          </Chip>
          {d.groups.map((g) => (
            <Chip key={g.id} on={group === g.id} onClick={() => setGroup(g.id)}>
              <i className={cn('inline-block size-2 rounded-full', GROUP_TONE[g.color]?.dot)} />
              {g.name} · {leads.filter((l) => l.groupId === g.id).length}
            </Chip>
          ))}
          <Chip on={group === 'none'} onClick={() => setGroup('none')}>
            Guruhsiz · {leads.filter((l) => !l.groupId).length}
          </Chip>
        </div>
      </div>

      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {cols.map((c) => {
          const list = leads.filter((l) => columnOf(l, first) === c.id && visible(l)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const tone = c.kind === 'joined' ? 'bg-au-ok' : c.kind === 'lost' ? 'bg-au-bad' : c.kind === 'telegram' ? 'bg-au-info' : 'bg-au-accent';
          return (
            <section
              key={c.id}
              data-col={c.id}
              aria-label={c.name}
              className={cn(
                'flex min-h-[200px] w-[276px] shrink-0 flex-col gap-2 rounded-2xl border border-dashed border-transparent bg-au-card-2 p-2.5 transition-colors',
                drag.over === c.id && 'border-au-accent bg-au-accent-soft',
              )}
            >
              <div className="flex items-center gap-2 px-1 pb-1">
                {c.kind === 'telegram' ? <Send className="size-3.5 text-au-info" /> : <i className={cn('inline-block size-2 rounded-full', tone)} />}
                <b className="text-sm text-au-ink">{c.name}</b>
                <span className="text-xs tabular-nums text-au-faint">{list.length}</span>
              </div>
              {list.length === 0 && <div className="px-1 py-2 text-xs text-au-faint">{c.kind === 'telegram' ? 'Botdan kelgan yangi lidlar shu yerga tushadi' : 'Bo‘sh — kartani shu yerga sudrang'}</div>}
              {list.map((l) => (
                <LeadCardItem
                  key={l.id}
                  l={l}
                  data={data}
                  now={now}
                  dragging={drag.id === l.id}
                  onPointerDown={data.canEdit ? (e) => drag.down(e, l.id, l.name) : undefined}
                  onOpen={() => (drag.justDropped() ? null : onOpenChange(l.id))}
                />
              ))}
            </section>
          );
        })}
      </div>
      {drag.ghost}

      <SalesStats data={data} />

      {open && <LeadDrawer key={open.id} l={open} data={data} onClose={() => onOpenChange(null)} />}
      {lostAsk && <LostReasonModal onClose={() => setLostAsk(null)} onPick={(reason) => {
        const { id, sectionId } = lostAsk;
        setLostAsk(null);
        setMoved((m) => ({ ...m, [id]: sectionId }));
        start(async () => {
          const r = await moveLeadAction({ id, sectionId, lostReason: reason });
          if (r.error) {
            setMoved((m) => {
              const n = { ...m };
              delete n[id];
              return n;
            });
            toast.error(leadErr(r.error));
            return;
          }
          toast.success('Rad etdi deb belgilandi');
          router.refresh();
        });
      }} />}
      {modal === 'add' && <AddLeadModal data={data} onClose={() => setModal(null)} onOpen={(id) => { setModal(null); onOpenChange(id); }} />}
      {modal === 'groups' && <GroupsModal data={data} onClose={() => setModal(null)} />}
      {modal === 'stages' && <StagesModal data={data} onClose={() => setModal(null)} />}
      {modal === 'tpl' && <TemplatesModal data={data} audience="lead" onClose={() => setModal(null)} />}
      {modal === 'archive' && <ArchiveModal data={data} onClose={() => setModal(null)} />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold', on ? 'border-au-ink text-au-ink' : 'border-au-line text-au-muted hover:text-au-ink')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LeadCardItem({
  l,
  data,
  now,
  dragging,
  onPointerDown,
  onOpen,
}: {
  l: SalesLead;
  data: OpsData;
  now: number;
  dragging: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  const g = data.sales.groups.find((x) => x.id === l.groupId);
  const waiting = isWaiting(l, now);
  const stuck = daysInStage(l, now);
  const fresh = now - tsDate(l.createdAt).getTime() < 86_400_000;
  const closed = !!l.studentId || !!l.lostReason;
  return (
    <article
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn(
        'relative flex cursor-pointer select-none flex-col gap-1.5 rounded-xl border bg-au-card px-3 py-2.5 text-left shadow-[var(--au-shadow-card)] hover:border-au-faint',
        waiting ? 'border-au-bad' : 'border-au-line',
        dragging && 'opacity-40',
        data.canEdit && 'touch-manipulation',
      )}
    >
      {fresh && <i className="absolute bottom-2.5 left-[-1px] top-2.5 w-[3px] rounded bg-au-accent" />}
      <div className="flex items-center gap-1.5">
        <b className="min-w-0 flex-1 truncate text-sm text-au-ink">{l.name || l.phone || 'Ismsiz'}</b>
        {l.source === 'telegram' && <span className="sx-pl info">Telegram</span>}
        {l.source !== 'telegram' && l.tg && <span className="sx-pl info">TG</span>}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-au-muted">
        {l.age != null && <span>{l.age} yosh</span>}
        {l.course && <span>{l.course}</span>}
        {l.phone && <span className="tabular-nums">{l.phone}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {g && <span className={cn('sx-pl', GROUP_TONE[g.color]?.pill)}>{g.name}</span>}
        {l.source !== 'telegram' && <span className="sx-pl mute">{sourceName(l.source)}</span>}
        {waiting && <span className="sx-pl bad">Javob kutmoqda</span>}
        {l.lostReason && <span className="sx-pl bad">{l.lostReason}</span>}
        {l.studentId && <span className="sx-pl ok">O‘quvchi</span>}
        {!closed && stuck >= 5 && <span className="sx-pl warn">bosqichda {stuck} kun</span>}
        {l.nextAt && !closed && <span className={cn('sx-pl', l.nextAt <= data.today.day ? 'warn' : 'mute')}>☎ {l.nextAt.slice(8, 10)}.{l.nextAt.slice(5, 7)}</span>}
        {l.trialDate && !closed && <span className="sx-pl info">Sinov {l.trialDate.slice(8, 10)}.{l.trialDate.slice(5, 7)}</span>}
        {l.comments > 0 && <span className="text-xs text-au-faint">💬 {l.comments}</span>}
        <span className="flex-1" />
        <span className="text-[11px] text-au-faint">{ago(l.createdAt, now)}</span>
      </div>
      {l.owner && <div className="text-[11px] text-au-faint">Mas’ul: {l.owner}</div>}
    </article>
  );
}

/**
 * Pointer drag for the board: a mouse drags after 6px; a finger after a
 * 300ms press (so a swipe still scrolls the board). Drop target = the column
 * under the pointer.
 */
function useBoardDrag(onDrop: (id: string, col: string) => void) {
  const [state, setState] = useState<{ id: string; name: string; x: number; y: number; over: string | null } | null>(null);
  const pending = useRef<{ id: string; name: string; x: number; y: number; touch: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const active = useRef(false);
  const dropped = useRef(0);
  const cb = useRef(onDrop);
  useEffect(() => {
    cb.current = onDrop;
  });

  useEffect(() => {
    const colAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null)?.dataset.col ?? null;
    const begin = (x: number, y: number) => {
      const p = pending.current;
      if (!p) return;
      active.current = true;
      setState({ id: p.id, name: p.name, x, y, over: colAt(x, y) });
    };
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!active.current) {
        const far = Math.hypot(e.clientX - p.x, e.clientY - p.y) > (p.touch ? 10 : 6);
        if (p.touch && far) {
          clearTimeout(p.timer);
          pending.current = null; // a swipe: let the board scroll
        } else if (!p.touch && far) begin(e.clientX, e.clientY);
        return;
      }
      setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY, over: colAt(e.clientX, e.clientY) } : s));
    };
    const onUp = (e: PointerEvent) => {
      const p = pending.current;
      if (p?.timer) clearTimeout(p.timer);
      pending.current = null;
      if (!active.current) return;
      active.current = false;
      dropped.current = Date.now();
      const col = colAt(e.clientX, e.clientY);
      setState(null);
      if (p && col) cb.current(p.id, col);
    };
    const noScroll = (e: TouchEvent) => {
      if (active.current) e.preventDefault();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', noScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', noScroll);
    };
  }, []);

  const down = (e: React.PointerEvent, id: string, name: string) => {
    if (e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const p: NonNullable<typeof pending.current> = { id, name, x: e.clientX, y: e.clientY, touch };
    if (touch)
      p.timer = setTimeout(() => {
        if (pending.current !== p) return;
        navigator.vibrate?.(15);
        active.current = true;
        setState({ id, name, x: p.x, y: p.y, over: null });
      }, 300);
    pending.current = p;
  };

  const ghost = state ? (
    <div
      className="pointer-events-none fixed z-[70] max-w-[240px] -translate-x-1/2 -translate-y-1/2 rotate-2 truncate rounded-xl border border-au-accent bg-au-card px-3 py-2 text-sm font-bold text-au-ink shadow-[var(--au-shadow-pop)]"
      style={{ left: state.x, top: state.y }}
    >
      {state.name || 'Lid'}
    </div>
  ) : null;

  return { id: state?.id ?? null, over: state?.over ?? null, down, ghost, justDropped: () => Date.now() - dropped.current < 250 };
}

function LostReasonModal({ onClose, onPick }: { onClose: () => void; onPick: (r: string) => void }) {
  const [r, setR] = useState('');
  return (
    <div className="sx-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sx-modal !w-[min(440px,100%)]" role="dialog" aria-modal="true" aria-label="Rad etish sababi">
        <div className="sx-h">
          <h3>Rad etish sababi</h3>
        </div>
        <p className="mb-3 text-sm text-au-muted">Sabab majburiy — statistikaga tushadi va takrorlansa yechim taklif qilinadi.</p>
        <select id="lost-r" className="sx-inp" value={r} onChange={(e) => setR(e.target.value)}>
          <option value="">— tanlang —</option>
          {Object.keys(LOST_FIX).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button className="sx-btn" onClick={onClose}>
            Bekor
          </button>
          <button className="sx-btn text-au-bad" disabled={!r} onClick={() => onPick(r)}>
            Rad etdi deb belgilash
          </button>
        </div>
      </div>
    </div>
  );
}

function SalesStats({ data }: { data: OpsData }) {
  const d = data.sales;
  const first = firstOpenStage(d);
  const funnel = d.stages.map((s) => ({ s, n: d.leads.filter((l) => columnOf(l, first) === s.id).length }));
  const tg = d.leads.filter((l) => columnOf(l, first) === TELEGRAM_COL).length;
  const max = Math.max(1, tg, ...funnel.map((f) => f.n));
  const lostMax = Math.max(1, ...d.stats.lostReasons.map((r) => r.n));
  return (
    <div className="sx-grid">
      <div className="sx-card s12 !pb-2">
        <div className="sx-h !mb-0">
          <h3>Sotuv statistikasi</h3>
          <small>voronka, manbalar, rad etish sabablari</small>
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Voronka</h3>
          <small>hozir har bosqichda</small>
        </div>
        <div className="flex flex-col gap-2.5">
          {[{ name: 'Telegram', n: tg, tone: 'bg-au-info' }, ...funnel.map((f) => ({ name: f.s.name, n: f.n, tone: f.s.kind === 'joined' ? 'bg-au-ok' : f.s.kind === 'lost' ? 'bg-au-bad' : 'bg-au-accent' }))].map((f) => (
            <div key={f.name} className="grid grid-cols-[minmax(110px,150px)_1fr_auto] items-center gap-2.5 text-[13px]">
              <span className="truncate text-au-ink">{f.name}</span>
              <span className="sx-hb">
                <i className={f.tone} style={{ width: `${(f.n / max) * 100}%` }} />
              </span>
              <span className="tabular-nums text-au-muted">{f.n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Manbalar</h3>
          <small>oxirgi 30 kun · lid → o‘quvchi</small>
        </div>
        {d.stats.sources.length === 0 ? (
          <div className="sx-empty">30 kunda lid yo‘q</div>
        ) : (
          <table className="sx-tbl lt">
            <tbody>
              {d.stats.sources.map((s) => (
                <tr key={s.source}>
                  <td className="text-au-ink">{sourceName(s.source)}</td>
                  <td className="text-right tabular-nums">{s.leads} lid</td>
                  <td className="text-right tabular-nums">{s.won} o‘quvchi</td>
                  <td className="text-right">
                    <span className={cn('sx-pl', s.leads && s.won / s.leads >= 0.2 ? 'ok' : 'mute')}>{s.leads ? Math.round((s.won / s.leads) * 100) : 0}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Rad etish sabablari</h3>
          <small>oxirgi 90 kun</small>
        </div>
        {d.stats.lostReasons.length === 0 ? (
          <div className="sx-empty">Rad etgan lid yo‘q</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {d.stats.lostReasons.map((r) => (
              <div key={r.reason}>
                <div className="grid grid-cols-[minmax(110px,150px)_1fr_auto] items-center gap-2.5 text-[13px]">
                  <span className="truncate text-au-ink">{r.reason}</span>
                  <span className="sx-hb">
                    <i className={r.n >= 3 ? 'bg-au-bad' : 'bg-au-faint'} style={{ width: `${(r.n / lostMax) * 100}%` }} />
                  </span>
                  <span className="tabular-nums text-au-muted">{r.n} ta</span>
                </div>
                {r.n >= 2 && <div className="mt-1 text-xs leading-snug text-au-muted">💡 {LOST_FIX[r.reason] ?? LOST_FIX.Boshqa}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
