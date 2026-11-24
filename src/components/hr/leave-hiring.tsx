'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Briefcase, Check, Palmtree, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
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
import { LEAVE_KINDS, fmtDayKey, leaveDays, type LeaveKind, type LeaveRow, type Vacancy } from '@/lib/hr-leave';

const ERR: Record<string, string> = {
  overlap: 'eOverlap',
  badRange: 'eBadRange',
  tooOld: 'eTooOld',
  tooLong: 'eTooLong',
  locked: 'eLocked',
  alreadyDecided: 'eDecided',
  noteRequired: 'eNote',
  forbidden: 'eForbidden',
  invalidInput: 'eInvalid',
};

/** Leave / hiring labels in the viewer's language. */
function useLh() {
  const t = useTranslations('lh');
  const tk = useTranslations('lh.kind');
  const ts = useTranslations('lh.st');
  return {
    t,
    kind: (k: LeaveKind) => tk(k),
    st: (s: LeaveRow['status']) => ts(s),
    err: (e: string) => t(ERR[e] ?? 'eOther'),
    span: (l: LeaveRow) => `${fmtDayKey(l.from)} – ${fmtDayKey(l.to)} · ${t('days', { n: l.days })}`,
  };
}

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
  const L = useLh();
  const run = (fn: () => Promise<{ error: string } | { ok: true }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if ('error' in r) return void toast.error(L.err(r.error));
      toast.success(ok);
      after?.();
      router.refresh();
    });
  return { busy, run };
}

function Pill({ s }: { s: LeaveRow['status'] }) {
  const L = useLh();
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONE[s])}>{L.st(s)}</span>;
}

/* ------------------------------------------------------------ leave */

export function LeaveView({ mine, team, meId, isCeo, today }: { mine: LeaveRow[]; team: LeaveRow[] | null; meId: string; isCeo: boolean; today: string }) {
  const { busy, run } = useRun();
  const L = useLh();
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
            <Palmtree className="size-4 text-au-accent-text" /> {L.t('request')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted">
              {L.t('kind')}
              <select className={INP} value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)}>
                {LEAVE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {L.kind(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-au-muted">
              {L.t('from')}
              <input type="date" className={INP} value={from} onChange={(e) => (setFrom(e.target.value), e.target.value > to && setTo(e.target.value))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-au-muted">
              {L.t('to')}
              <input type="date" className={INP} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted">
              {L.t('reason')}
              <input className={INP} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !from || !to || okDays < 1}
            className={cn(BTN, 'self-start bg-au-accent text-white')}
            onClick={() => run(() => requestLeaveAction({ kind, from, to, reason: reason || undefined }), L.t('sent'), () => setReason(''))}
          >
            <Plus className="size-4" /> {L.t('send')}{okDays > 0 ? ` · ${L.t('days', { n: okDays })}` : ''}
          </button>
        </section>

        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
          <div className="text-sm font-bold text-au-ink">{L.t('mine')}</div>
          {mine.length === 0 && <p className="text-sm text-au-muted">{L.t('noMine')}</p>}
          {mine.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-au-ctl border border-au-line p-3 text-sm">
              <div className="min-w-0 flex-1">
                <b className="text-au-ink">{L.kind(l.kind)}</b> <span className="text-au-muted">· {L.span(l)}</span>
                {l.reason && <div className="text-xs text-au-muted">{l.reason}</div>}
                {l.note && <div className={cn('text-xs', l.status === 'rejected' ? 'text-au-bad' : 'text-au-muted')}>{l.decidedBy ?? L.t('mgmt')}: {l.note}</div>}
              </div>
              <Pill s={l.status} />
              {canCancel(l) && (
                <button
                  type="button"
                  disabled={busy}
                  className={cn(BTN, 'h-8 border border-au-line text-au-muted hover:text-au-bad')}
                  onClick={async () => {
                    if (!(await ask(l.status === 'approved' ? L.t('cancelApproved') : L.t('withdraw'), { ok: L.t('yes') }))) return;
                    run(() => cancelLeaveAction(l.id), L.t('cancelled'));
                  }}
                >
                  {L.t('cancel')}
                </button>
              )}
            </div>
          ))}
        </section>
      </div>

      {team && (
        <div className="flex flex-col gap-5">
          <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
            <div className="text-sm font-bold text-au-ink">{L.t('pending', { n: pending.length })}</div>
            {pending.length === 0 && <p className="text-sm text-au-muted">{L.t('noPending')}</p>}
            {pending.map((l) => {
              const own = l.userId === meId && !isCeo;
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-au-ctl border border-au-line p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {L.kind(l.kind)} · {L.span(l)}</span>
                    {l.reason && <div className="text-xs text-au-muted">{l.reason}</div>}
                  </div>
                  {own ? (
                    <span className="text-xs text-au-faint">{L.t('own')}</span>
                  ) : (
                    <>
                      <button type="button" disabled={busy} className={cn(BTN, 'h-8 bg-au-accent text-white')} onClick={() => run(() => decideLeaveAction({ id: l.id, approve: true }), L.t('approved'))}>
                        <Check className="size-4" /> {L.t('approve')}
                      </button>
                      <button type="button" disabled={busy} className={cn(BTN, 'h-8 border border-au-line text-au-muted hover:text-au-bad')} onClick={() => (setRejecting(rejecting === l.id ? null : l.id), setNote(''))}>
                        <X className="size-4" /> {L.t('rejectShort')}
                      </button>
                    </>
                  )}
                  {rejecting === l.id && (
                    <div className="flex basis-full gap-2">
                      <input autoFocus className={cn(INP, 'min-w-0 flex-1')} maxLength={300} placeholder={L.t('rejectPh')} value={note} onChange={(e) => setNote(e.target.value)} />
                      <button
                        type="button"
                        disabled={busy || !note.trim()}
                        className={cn(BTN, 'bg-au-bad text-white')}
                        onClick={() => run(() => decideLeaveAction({ id: l.id, approve: false, note: note.trim() }), L.t('rejected'), () => setRejecting(null))}
                      >
                        {L.t('reject')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className={cn(SURFACE_CARD, 'grid gap-4 p-5 sm:grid-cols-2')}>
            <div className="grid content-start gap-1.5">
              <div className="text-sm font-bold text-au-ink">{L.t('away', { n: away.length })}</div>
              {away.length === 0 && <p className="text-sm text-au-muted">{L.t('allIn')}</p>}
              {away.map((l) => (
                <div key={l.id} className="text-sm">
                  <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {L.kind(l.kind)} · {L.t('until', { d: fmtDayKey(l.to) })}</span>
                </div>
              ))}
            </div>
            <div className="grid content-start gap-1.5">
              <div className="text-sm font-bold text-au-ink">{L.t('soon', { n: soon.length })}</div>
              {soon.length === 0 && <p className="text-sm text-au-muted">{L.t('noSoon')}</p>}
              {soon.slice(0, 12).map((l) => (
                <div key={l.id} className="text-sm">
                  <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {L.span(l)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
            <div className="text-sm font-bold text-au-ink">{L.t('decisions')}</div>
            {decided.length === 0 && <p className="text-sm text-au-muted">{L.t('noDecisions')}</p>}
            {decided.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-au-line py-2 text-sm last:border-0">
                <div className="min-w-0 flex-1">
                  <b className="text-au-ink">{l.name}</b> <span className="text-au-muted">· {L.kind(l.kind)} · {L.span(l)}</span>
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
                  title={L.t('undoTitle')}
                  aria-label={L.t('undo')}
                  className="grid size-8 place-items-center rounded-au-ctl text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                  onClick={async () => {
                    if (!(await ask(L.t('undoQ', { n: l.name }), { ok: L.t('cancel') }))) return;
                    run(() => reopenLeaveAction(l.id), L.t('undone'));
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
  const L = useLh();
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
      <div className="text-sm font-bold text-au-ink">{draft.id ? L.t('editVac') : L.t('newVac')}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted">
          {L.t('position')}
          <input autoFocus className={INP} maxLength={120} placeholder={L.t('posPh')} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-au-muted">
          {L.t('dept')}
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
        {num('seats', L.t('seats'))}
        {num('applicants', L.t('applicants'))}
        {num('interviews', L.t('interviews'))}
        {num('offers', L.t('offers'))}
        <label className="col-span-2 grid gap-1 text-xs font-semibold text-au-muted sm:col-span-4">
          {L.t('note')}
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
              draft.id ? L.t('saved') : L.t('opened'),
              () => setDraft(null),
            )
          }
        >
          {L.t('save')}
        </button>
        <button type="button" className={cn(BTN, 'border border-au-line text-au-muted')} onClick={() => setDraft(null)}>
          {L.t('cancel')}
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
          {L.t('vacMeta', { d: deptLabels[v.dept] ?? v.dept, s: v.seats, st: v.status === 'open' ? L.t('openFor', { n: daysSince(v.openedAt) }) : L.t('closedIn', { n: daysSince(v.openedAt, v.closedAt) }) })}
        </span>
        <div className="text-xs text-au-muted">
          {L.t('funnel', { a: v.applicants, i: v.interviews, o: v.offers })}{v.note ? ` · ${v.note}` : ''}
        </div>
      </div>
      <button
        type="button"
        className={cn(BTN, 'h-8 border border-au-line text-au-ink')}
        onClick={() => setDraft({ id: v.id, title: v.title, dept: v.dept, seats: v.seats, applicants: v.applicants, interviews: v.interviews, offers: v.offers, note: v.note ?? '' })}
      >
        {L.t('edit')}
      </button>
      <button
        type="button"
        disabled={busy}
        className={cn(BTN, 'h-8 border border-au-line', v.status === 'open' ? 'text-au-ok' : 'text-au-muted')}
        onClick={() => run(() => setVacancyOpenAction(v.id, v.status !== 'open'), v.status === 'open' ? L.t('vacClosed') : L.t('reopened'))}
      >
        {v.status === 'open' ? L.t('close') : L.t('reopen')}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={L.t('delete')}
        className="grid size-8 place-items-center rounded-au-ctl text-au-muted hover:bg-au-card-2 hover:text-au-bad"
        onClick={async () => {
          if (!(await ask(L.t('delQ', { t: v.title })))) return;
          run(() => deleteVacancyAction(v.id), L.t('deleted'));
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
          [L.t('kOpen'), open.length],
          [L.t('kApps'), totals.app],
          [L.t('kInt'), `${totals.int} · ${totals.off}`],
          [L.t('kAvg'), avgClose === null ? '—' : L.t('days', { n: avgClose })],
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
          <span className="flex-1 text-sm font-bold text-au-ink">{L.t('openList', { n: open.length })}</span>
          {!draft && (
            <button type="button" className={cn(BTN, 'h-8 bg-au-accent text-white')} onClick={() => setDraft({ ...blank })}>
              <Plus className="size-4" /> {L.t('vacancy')}
            </button>
          )}
        </div>
        {open.length === 0 && <p className="text-sm text-au-muted">{L.t('noOpen')}</p>}
        {open.map(row)}
      </section>
      {closed.length > 0 && (
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-5')}>
          <div className="text-sm font-bold text-au-ink">{L.t('closedList', { n: closed.length })}</div>
          {closed.map(row)}
        </section>
      )}
      <AskHost />
    </div>
  );
}
