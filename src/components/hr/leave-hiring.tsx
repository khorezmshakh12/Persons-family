'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Briefcase, Check, Palmtree, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/lib/glass';
import { AskHost, ask } from '@/components/strategy/suite-shell';
import '@/components/strategy/suite.css';
import {
  cancelLeaveAction,
  decideLeaveAction,
  deleteVacancyAction,
  reopenLeaveAction,
  requestLeaveAction,
  saveVacancyAction,
  setVacancyOpenAction,
} from '@/lib/actions/hr-leave';
import { LEAVE_KINDS, LEAVE_KIND_LABEL, LEAVE_STATUS_LABEL, fmtDayKey, leaveDays, type LeaveKind, type LeaveRow, type Vacancy } from '@/lib/hr-leave';

const ERR: Record<string, string> = {
  overlap: 'Bu kunlarga sizda allaqachon so‘rov bor',
  badRange: 'Tugash sanasi boshlanishdan oldin bo‘lmasin',
  tooOld: '60 kundan eski sana tanlab bo‘lmaydi',
  tooLong: 'Bir so‘rov ko‘pi bilan 90 kun',
  locked: 'Bu holatda o‘zgartirib bo‘lmaydi',
  alreadyDecided: 'Qaror allaqachon qabul qilingan',
  noteRequired: 'Rad etish sababini yozing',
  forbidden: 'Ruxsat yo‘q',
  invalidInput: 'Ma’lumot noto‘g‘ri',
};
const errText = (e: string) => ERR[e] ?? 'Saqlab bo‘lmadi';

const INP = 'h-9 rounded-au-ctl border border-au-line bg-au-card px-2.5 text-sm text-au-ink';
const BTN = 'inline-flex h-9 items-center gap-1.5 rounded-au-ctl px-3 text-sm font-semibold disabled:opacity-40';
const TONE: Record<LeaveRow['status'], string> = {
  pending: 'bg-au-accent-soft text-au-accent-text',
  approved: 'bg-au-ok-soft text-au-ok',
  rejected: 'bg-au-bad-soft text-au-bad',
  cancelled: 'bg-au-card-2 text-au-muted',
};

function useRun() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ error: string } | { ok: true }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if ('error' in r) return void toast.error(errText(r.error));
      toast.success(ok);
      after?.();
      router.refresh();
    });
  return { busy, run };
}

function Pill({ s }: { s: LeaveRow['status'] }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONE[s])}>{LEAVE_STATUS_LABEL[s]}</span>;
}

const spanText = (l: LeaveRow) => `${fmtDayKey(l.from)} – ${fmtDayKey(l.to)} · ${l.days} kun`;

/* ------------------------------------------------------------ leave */

export function LeaveView({ mine, team, meId, isCeo, today }: { mine: LeaveRow[]; team: LeaveRow[] | null; meId: string; isCeo: boolean; today: string }) {
  const { busy, run } = useRun();
  const [kind, setKind] = useState<LeaveKind>('vacation');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const pending = (team ?? []).filter((l) => l.status === 'pending');
  const away = (team ?? []).filter((l) => l.status === 'approved' && l.from <= today && l.to >= today);
  const soon = (team ?? []).filter((l) => l.status === 'approved' && l.from > today).sort((a, b) => a.from.localeCompare(b.from));
  const decided = (team ?? []).filter((l) => l.status === 'approved' || l.status === 'rejected').slice(0, 60);
  const canCancel = (l: LeaveRow) => l.status === 'pending' || (l.status === 'approved' && l.from > today);
  const okDays = to >= from ? leaveDays(from, to) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-5">
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
          <div className="flex items-center gap-2 text-sm font-bold text-au-ink">
            <Palmtree className="size-4 text-au-accent-text" /> Ta’til / ruxsat so‘rash
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted">
              Turi
              <select className={INP} value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)}>
                {LEAVE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LEAVE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-au-muted">
              Boshlanish
              <input type="date" className={INP} value={from} onChange={(e) => (setFrom(e.target.value), e.target.value > to && setTo(e.target.value))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-au-muted">
              Tugash
              <input type="date" className={INP} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted">
              Sabab / izoh (ixtiyoriy)
              <input className={INP} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !from || !to || okDays < 1}
            className={cn(BTN, 'self-start bg-au-accent text-white')}
            onClick={() => run(() => requestLeaveAction({ kind, from, to, reason: reason || undefined }), 'So‘rov yuborildi — rahbariyat va HR ko‘radi', () => setReason(''))}
          >
            <Plus className="size-4" /> Yuborish{okDays > 0 ? ` · ${okDays} kun` : ''}
          </button>
        </section>

        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
          <div className="text-sm font-bold text-au-ink">Mening so‘rovlarim</div>
          {mine.length === 0 && <p className="text-sm text-au-muted">Hali so‘rov yo‘q</p>}
          {mine.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-au-ctl border border-au-line p-3 text-sm">
              <div className="min-w-0 flex-1">
                <b className="text-au-ink">{LEAVE_KIND_LABEL[l.kind]}</b> <span className="text-au-muted">· {spanText(l)}</span>
                {l.reason && <div className="text-xs text-au-muted">{l.reason}</div>}
                {l.note && <div className={cn('text-xs', l.status === 'rejected' ? 'text-au-bad' : 'text-au-muted')}>{l.decidedBy ?? 'Rahbariyat'}: {l.note}</div>}
              </div>
              <Pill s={l.status} />
              {canCancel(l) && (
                <button
                  type="button"
                  disabled={busy}
                  className={cn(BTN, 'h-8 border border-au-line text-au-muted hover:text-au-bad')}
                  onClick={async () => {
                    if (!(await ask(l.status === 'approved' ? 'Tasdiqlangan ta’til bekor qilinsinmi? Rahbariyatga xabar boradi.' : 'So‘rov qaytarib olinsinmi?', { ok: 'Ha' }))) return;
                    run(() => cancelLeaveAction(l.id), 'Bekor qilindi');
                  }}
                >
                  Bekor qilish
                </button>
              )}
            </div>
          ))}
        </section>
      </div>

      {team && (
        <div className="flex flex-col gap-5">
          <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
            <div className="text-sm font-bold text-au-ink">Tasdiq kutmoqda · {pending.length}</div>
            {pending.length === 0 && <p className="text-sm text-au-muted">Kutilayotgan so‘rov yo‘q</p>}
            {pending.map((l) => {
              const own = l.userId === meId && !isCeo;
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-au-ctl border border-au-line p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {LEAVE_KIND_LABEL[l.kind]} · {spanText(l)}</span>
                    {l.reason && <div className="text-xs text-au-muted">{l.reason}</div>}
                  </div>
                  {own ? (
                    <span className="text-xs text-au-faint">O‘z so‘rovingizni boshqa rahbar tasdiqlaydi</span>
                  ) : (
                    <>
                      <button type="button" disabled={busy} className={cn(BTN, 'h-8 bg-au-accent text-white')} onClick={() => run(() => decideLeaveAction({ id: l.id, approve: true }), 'Tasdiqlandi')}>
                        <Check className="size-4" /> Tasdiqlash
                      </button>
                      <button type="button" disabled={busy} className={cn(BTN, 'h-8 border border-au-line text-au-muted hover:text-au-bad')} onClick={() => (setRejecting(rejecting === l.id ? null : l.id), setNote(''))}>
                        <X className="size-4" /> Rad
                      </button>
                    </>
                  )}
                  {rejecting === l.id && (
                    <div className="flex basis-full gap-2">
                      <input autoFocus className={cn(INP, 'min-w-0 flex-1')} maxLength={300} placeholder="Rad etish sababi — xodimga yuboriladi" value={note} onChange={(e) => setNote(e.target.value)} />
                      <button
                        type="button"
                        disabled={busy || !note.trim()}
                        className={cn(BTN, 'bg-au-bad text-white')}
                        onClick={() => run(() => decideLeaveAction({ id: l.id, approve: false, note: note.trim() }), 'Rad etildi', () => setRejecting(null))}
                      >
                        Rad etish
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className={cn(SURFACE_CARD, 'grid gap-4 p-5 sm:grid-cols-2')}>
            <div className="grid content-start gap-1.5">
              <div className="text-sm font-bold text-au-ink">Bugun ishda emas · {away.length}</div>
              {away.length === 0 && <p className="text-sm text-au-muted">Hamma ishda</p>}
              {away.map((l) => (
                <div key={l.id} className="text-sm">
                  <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {LEAVE_KIND_LABEL[l.kind]} · {fmtDayKey(l.to)} gacha</span>
                </div>
              ))}
            </div>
            <div className="grid content-start gap-1.5">
              <div className="text-sm font-bold text-au-ink">Yaqinda · {soon.length}</div>
              {soon.length === 0 && <p className="text-sm text-au-muted">Rejalashtirilgan ta’til yo‘q</p>}
              {soon.slice(0, 12).map((l) => (
                <div key={l.id} className="text-sm">
                  <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {spanText(l)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
            <div className="text-sm font-bold text-au-ink">Qarorlar</div>
            {decided.length === 0 && <p className="text-sm text-au-muted">Hali qaror yo‘q</p>}
            {decided.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-au-line py-2 text-sm last:border-0">
                <div className="min-w-0 flex-1">
                  <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {LEAVE_KIND_LABEL[l.kind]} · {spanText(l)}</span>
                  {(l.decidedBy || l.note) && (
                    <div className="text-xs text-au-muted">
                      {l.decidedBy}
                      {l.note ? `: ${l.note}` : ''}
                    </div>
                  )}
                </div>
                <Pill s={l.status} />
                <button
                  type="button"
                  disabled={busy}
                  title="Qarorni bekor qilish — yana «kutilmoqda»"
                  aria-label="Qarorni bekor qilish"
                  className="grid size-8 place-items-center rounded-au-ctl text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                  onClick={async () => {
                    if (!(await ask(`${l.name}: qaror bekor qilinsinmi? So‘rov yana «kutilmoqda» bo‘ladi, xodimga xabar boradi.`, { ok: 'Bekor qilish' }))) return;
                    run(() => reopenLeaveAction(l.id), 'Qaror bekor qilindi');
                  }}
                >
                  <RotateCcw className="size-4" />
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
      <AskHost />
    </div>
  );
}

/* ------------------------------------------------------------ hiring */

type Draft = { id?: string; title: string; dept: string; seats: number; applicants: number; interviews: number; offers: number; note: string };
const blank: Draft = { title: '', dept: 'acad', seats: 1, applicants: 0, interviews: 0, offers: 0, note: '' };
const daysSince = (iso: string, until?: string | null) => Math.max(0, Math.round(((until ? Date.parse(until) : Date.now()) - Date.parse(iso)) / 86_400_000));

export function HiringView({ vacancies, deptLabels }: { vacancies: Vacancy[]; deptLabels: Record<string, string> }) {
  const { busy, run } = useRun();
  const [draft, setDraft] = useState<Draft | null>(null);
  const open = vacancies.filter((v) => v.status === 'open');
  const closed = vacancies.filter((v) => v.status === 'closed');
  const avgClose = closed.length ? Math.round(closed.reduce((a, v) => a + daysSince(v.openedAt, v.closedAt), 0) / closed.length) : null;
  const totals = open.reduce((a, v) => ({ app: a.app + v.applicants, int: a.int + v.interviews, off: a.off + v.offers }), { app: 0, int: 0, off: 0 });
  const num = (k: 'seats' | 'applicants' | 'interviews' | 'offers', label: string) =>
    draft && (
      <label className="grid gap-1 text-xs font-semibold text-au-muted">
        {label}
        <input type="number" min={k === 'seats' ? 1 : 0} className={INP} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
      </label>
    );

  const editor = draft && (
    <section className={cn(SURFACE_CARD, 'grid gap-2 p-5')}>
      <div className="text-sm font-bold text-au-ink">{draft.id ? 'Vakansiyani tahrirlash' : 'Yangi vakansiya'}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted">
          Lavozim
          <input autoFocus className={INP} maxLength={120} placeholder="IELTS o‘qituvchisi" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-au-muted">
          Bo‘lim
          <select className={INP} value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
            {Object.entries(deptLabels)
              .filter(([k]) => k !== 'top')
              .map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
          </select>
        </label>
        {num('seats', 'O‘rinlar')}
        {num('applicants', 'Arizalar')}
        {num('interviews', 'Suhbatlar')}
        {num('offers', 'Offerlar')}
        <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted sm:col-span-4">
          Izoh
          <input className={INP} maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !draft.title.trim() || draft.seats < 1}
          className={cn(BTN, 'bg-au-accent text-white')}
          onClick={() =>
            run(
              () => saveVacancyAction({ ...draft, dept: draft.dept as 'acad', title: draft.title.trim(), note: draft.note.trim() || undefined }),
              draft.id ? 'Saqlandi' : 'Vakansiya ochildi',
              () => setDraft(null),
            )
          }
        >
          Saqlash
        </button>
        <button type="button" className={cn(BTN, 'border border-au-line text-au-muted')} onClick={() => setDraft(null)}>
          Bekor qilish
        </button>
      </div>
    </section>
  );

  const row = (v: Vacancy) => (
    <div key={v.id} className={cn('flex flex-wrap items-center gap-3 rounded-au-ctl border border-au-line p-3 text-sm', v.status === 'closed' && 'opacity-70')}>
      <div className="min-w-0 flex-1">
        <b className="text-au-ink">{v.title}</b>
        <span className="text-au-muted">
          {' '}
          · {deptLabels[v.dept] ?? v.dept} · {v.seats} o‘rin · {v.status === 'open' ? `${daysSince(v.openedAt)} kun ochiq` : `${daysSince(v.openedAt, v.closedAt)} kunda yopildi`}
        </span>
        <div className="text-xs text-au-muted">
          {v.applicants} ariza · {v.interviews} suhbat · {v.offers} offer{v.note ? ` · ${v.note}` : ''}
        </div>
      </div>
      <button
        type="button"
        className={cn(BTN, 'h-8 border border-au-line text-au-ink')}
        onClick={() => setDraft({ id: v.id, title: v.title, dept: v.dept, seats: v.seats, applicants: v.applicants, interviews: v.interviews, offers: v.offers, note: v.note ?? '' })}
      >
        Tahrirlash
      </button>
      <button
        type="button"
        disabled={busy}
        className={cn(BTN, 'h-8 border border-au-line', v.status === 'open' ? 'text-au-ok' : 'text-au-muted')}
        onClick={() => run(() => setVacancyOpenAction(v.id, v.status !== 'open'), v.status === 'open' ? 'Vakansiya yopildi' : 'Qayta ochildi')}
      >
        {v.status === 'open' ? 'Yopish' : 'Qayta ochish'}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label="O‘chirish"
        className="grid size-8 place-items-center rounded-au-ctl text-au-muted hover:bg-au-card-2 hover:text-au-bad"
        onClick={async () => {
          if (!(await ask(`«${v.title}» vakansiyasi butunlay o‘chirilsinmi? Faqat xato ochilgan bo‘lsa — to‘lgan vakansiyani «Yopish» bilan yoping.`))) return;
          run(() => deleteVacancyAction(v.id), 'O‘chirildi');
        }}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Ochiq vakansiya', open.length],
          ['Arizalar (ochiq)', totals.app],
          ['Suhbat · offer', `${totals.int} · ${totals.off}`],
          ['O‘rtacha yopilish', avgClose === null ? '—' : `${avgClose} kun`],
        ].map(([k, v]) => (
          <div key={String(k)} className={cn(SURFACE_CARD, 'p-4')}>
            <div className="text-xs text-au-muted">{k}</div>
            <div className="text-xl font-bold text-au-ink tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {editor}
      <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
        <div className="flex items-center gap-2">
          <Briefcase className="size-4 text-au-accent-text" />
          <span className="flex-1 text-sm font-bold text-au-ink">Ochiq vakansiyalar · {open.length}</span>
          {!draft && (
            <button type="button" className={cn(BTN, 'h-8 bg-au-accent text-white')} onClick={() => setDraft({ ...blank })}>
              <Plus className="size-4" /> Vakansiya
            </button>
          )}
        </div>
        {open.length === 0 && <p className="text-sm text-au-muted">Ochiq vakansiya yo‘q</p>}
        {open.map(row)}
      </section>
      {closed.length > 0 && (
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
          <div className="text-sm font-bold text-au-ink">Yopilgan · {closed.length}</div>
          {closed.map(row)}
        </section>
      )}
      <AskHost />
    </div>
  );
}
