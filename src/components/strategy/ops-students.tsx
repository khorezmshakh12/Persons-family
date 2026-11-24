'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Download, Mail, Pencil, Phone, Search, Settings2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { useRouter } from '@/i18n/navigation';
import { unmarkPaidElsewhereAction } from '@/lib/actions/students';
import { daysBetween, nextDueDate } from '@/lib/billing';
import type { StudentRow } from '@/lib/ops-students';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { useTranslations } from 'next-intl';
import { dmy, som, useOpsMeta, when } from './ops-students-meta';
import { StudentCardDrawer } from './ops-student-card';
import { BillingSettingsModal, LogModal, PaidElsewhereModal, TemplatesModal } from './ops-student-admin';

type Filter = 'active' | 'inactive' | 'debt' | 'frozen' | 'risk' | 'notg' | 'archive';
const FILTERS: [Filter, string][] = [
  ['active', 'fActive'],
  ['inactive', 'fInactive'],
  ['debt', 'fDebt'],
  ['frozen', 'fFrozen'],
  ['risk', 'fRisk'],
  ['notg', 'fNotg'],
  ['archive', 'fArchive'],
];
type GradeF = 'all' | 'ok' | 'late' | 'hard';
const GRADES: [GradeF, string][] = [
  ['all', 'gAll'],
  ['ok', 'gOk'],
  ['late', 'gLate'],
  ['hard', 'gHard'],
];
const PAGE = 100;
const LOG_ICON: Record<string, [string, string]> = {
  pay: ['+', 'bg-au-ok-soft text-au-ok'],
  charge: ['−', 'bg-au-bad-soft text-au-bad'],
  msg: ['✉', 'bg-au-accent-soft text-au-accent'],
  archive: ['⌫', 'bg-au-card-2 text-au-muted'],
  restore: ['↺', 'bg-au-info-soft text-au-info'],
  freeze: ['❄', 'bg-au-info-soft text-au-info'],
  call: ['☎', 'bg-au-accent-soft text-au-accent'],
  edit: ['✎', 'bg-au-card-2 text-au-muted'],
  settings: ['⚙', 'bg-au-card-2 text-au-muted'],
};

const isLive = (s: StudentRow) => s.status !== 'archived';
/** Not archived, not frozen, but no monthly fee or no payment yet — so not «faol». */
const isPending = (s: StudentRow) => s.status === 'active' && !s.active;
const WHY: Record<string, string> = { nofee: 'whyNofee', nopay: 'whyNopay' };

/**
 * Operation HQ › O'quvchilar (2026-10-23): every CRM student — phone, debt (red)
 * or «Aktiv», payment grade, monthly fee and the activation date that is the
 * monthly billing day. A row opens the student's card (payments, charges, who
 * did what). Recent actions on top, statistics and exit reasons below.
 */
export function OpsStudents({ data }: { data: OpsData }) {
  const d = data.students;
  const today = data.today.day;
  const [filter, setFilter] = useState<Filter>('active');
  const [grade, setGrade] = useState<GradeF>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<{ id: string; pane?: string } | null>(null);
  const [modal, setModal] = useState<'tpl' | 'settings' | 'log' | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [faol, setFaol] = useState<StudentRow[] | null>(null);
  const router = useRouter();
  const [undoing, startUndo] = useTransition();
  const t = useTranslations('ops.stu');
  const to = useTranslations('ops');
  const { CALLS, GRADE, errText, reasonLabel } = useOpsMeta();

  const live = d.rows.filter(isLive);
  const billed = live.filter((s) => s.active);
  const debtors = live.filter((s) => s.balance < 0);
  const debt = debtors.reduce((a, s) => a - s.balance, 0);
  const month = d.stats.month;
  const leftThisMonth = d.rows.filter((s) => s.archivedAt?.startsWith(month)).length;
  const expected = billed.reduce((a, s) => a + s.fee, 0);
  const paidCount = billed.filter((s) => s.paidThisMonth).length;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return d.rows.filter((s) => {
      if (t && !s.name.toLowerCase().includes(t) && !(digits.length >= 3 && s.phone.replace(/\D/g, '').includes(digits))) return false;
      if (filter === 'archive') return !isLive(s);
      if (!isLive(s)) return false;
      if (grade !== 'all' && s.grade.grade !== grade) return false;
      if (filter === 'active') return s.active;
      if (filter === 'inactive') return isPending(s);
      if (filter === 'debt') return s.balance < 0;
      if (filter === 'frozen') return s.status === 'frozen';
      if (filter === 'risk') return s.risk;
      if (filter === 'notg') return !s.tg;
      return true;
    });
  }, [d.rows, q, filter, grade]);

  const pick = filter !== 'archive' && data.canEdit;
  const pickable = rows.filter(isPending);
  const toggle = (id: string) =>
    setSel((x) => {
      const n = new Set(x);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const chosen = d.rows.filter((s) => sel.has(s.id) && isPending(s));
  const undoFaol = (s: StudentRow) =>
    startUndo(async () => {
      const r = await unmarkPaidElsewhereAction(s.id);
      if (r.error) {
        playSound('err');
        toast.error(errText(r.error));
        return;
      }
      playSound('ok');
      toast.success(t('undone'));
      router.refresh();
    });

  const callList = live
    .filter((s) => s.balance < 0 && s.grade.openDays >= d.settings.callAfterDays)
    .sort((a, b) => a.balance - b.balance);

  const exportCsv = () => {
    const head = t('csvHead').split('|');
    const lines = rows.map((s) => [
      s.name,
      s.phone,
      s.tgUsername ? `@${s.tgUsername}` : '',
      s.father,
      s.mother,
      s.parent,
      s.groupSince ?? '',
      s.activeSince ?? '',
      s.status === 'archived' ? t('csvArchive', { reason: reasonLabel(s.leaveReason) }) : s.balance < 0 ? t('debtor') : s.status === 'frozen' ? t('frozen') : t('active'),
      String(Math.round(s.balance)),
      String(s.fee),
      String(s.discountPct),
      s.start ?? '',
      s.start && s.status === 'active' ? nextDueDate(s.start, today) : '',
      GRADE[s.grade.grade].n,
    ]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `oquvchilar-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openCard = (id: string, pane?: string) => {
    playSound('open');
    setOpen({ id, pane });
  };
  const current = open ? d.rows.find((s) => s.id === open.id) : undefined;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Oxirgi amallar */}
      <div className="sx-card px-5 py-[18px]">
        <div className="sx-h">
          <h3>{t('recent')}</h3>
          <small>{t('recentSub')}</small>
          <span className="sp" />
          <button className="sx-btn sm" onClick={() => setModal('log')}>
            {t('all')}
          </button>
        </div>
        {d.log.length === 0 ? (
          <div className="sx-empty">{t('noLog')}</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {d.log.slice(0, 6).map((l) => (
              <LogItem key={l.id} l={l} onOpen={l.studentId ? () => openCard(l.studentId!) : undefined} />
            ))}
          </ul>
        )}
      </div>

      {data.money && (
      <div className="sx-grid">
        <div className="sx-card sx-stat dark s3">
          <div className="l">{t('activeStudents')}</div>
          <div className="v">{billed.length + live.filter((s) => s.status === 'frozen').length}</div>
          <div className="d">
            {t('activeBreak', { p: live.filter(isPending).length, f: live.filter((s) => s.status === 'frozen').length, a: d.rows.length - live.length })}
          </div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">{t('paidMonth')}</div>
          <div className="v">
            {paidCount} <span className="text-base text-au-faint">/ {billed.length}</span>
          </div>
          <div className="d">
            {t('inPlan', { sum: som(d.stats.collected), plan: formatUZS(expected) })}
          </div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">{t('debtors')}</div>
          <div className={cn('v', debtors.length > 0 && 'text-au-bad')}>{debtors.length}</div>
          <div className="d">{t('total', { sum: som(debt) })}</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">{t('leftMonth')}</div>
          <div className="v">{leftThisMonth}</div>
          <div className="d">{t('atRisk', { n: live.filter((s) => s.risk).length })}</div>
        </div>
      </div>
      )}

      {/* Ro'yxat */}
      <div className="sx-card px-5 py-[18px]">
        <div className="sx-h flex-wrap gap-2">
          <h3>{t('students')}</h3>
          <small>{to('c.count', { n: rows.length })}</small>
          <span className="sp" />
          <button className="sx-btn sm" onClick={exportCsv} title={t('excelTip')}>
            <Download className="size-4" /> Excel
          </button>
          <button className="sx-btn sm" onClick={() => setModal('tpl')}>
            <Mail className="size-4" /> {t('templates')}
          </button>
          <button className="sx-btn sm" onClick={() => setModal('settings')}>
            <Settings2 className="size-4" /> {t('autoCharge')}{' '}
            <span className={cn('sx-pl', d.settings.enabled ? 'ok' : 'mute')}>{d.settings.enabled ? t('on') : t('off')}</span>
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="sx-seg">
            {FILTERS.map(([k, n]) => (
              <button key={k} className={cn(filter === k && 'on')} onClick={() => { setFilter(k); setLimit(PAGE); setSel(new Set()); }}>
                {t(n)}
              </button>
            ))}
          </div>
          {filter !== 'archive' && (
            <div className="sx-seg">
              {GRADES.map(([k, n]) => (
                <button key={k} className={cn(grade === k && 'on')} onClick={() => { setGrade(k); setLimit(PAGE); }}>
                  {t(n)}
                </button>
              ))}
            </div>
          )}
          <span className="flex-1" />
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-au-faint" />
            <input id="ops-stu-q" className="sx-inp !w-[230px] !pl-8" placeholder={t('searchPh')} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          </label>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">{d.rows.length ? t('notFound') : t('noStudents')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sx-tbl lt min-w-[980px]">
              <thead>
                {filter === 'archive' ? (
                  <tr>
                    <th>{to('c.name')}</th>
                    <th>{to('c.phone')}</th>
                    <th>{t('archived')}</th>
                    <th>{t('reason')}</th>
                    <th>{t('archivedBy')}</th>
                    <th className="text-right">{t('debtLeft')}</th>
                  </tr>
                ) : (
                  <tr>
                    {pick && (
                      <th className="w-[34px]">
                        {pickable.length > 0 && (
                          <input
                            id="ops-stu-all"
                            type="checkbox"
                            aria-label={t('pickInactive')}
                            checked={pickable.every((s) => sel.has(s.id))}
                            onChange={(e) => setSel(e.target.checked ? new Set(pickable.map((s) => s.id)) : new Set())}
                          />
                        )}
                      </th>
                    )}
                    <th>{to('c.name')}</th>
                    <th>{to('c.phone')}</th>
                    <th>{t('status')}</th>
                    <th>{t('grade')}</th>
                    <th className="text-right">{t('fee')}</th>
                    <th>{t('dates')}</th>
                    <th>{t('next')}</th>
                    {data.canEdit && <th className="w-[120px]" />}
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.slice(0, limit).map((s) =>
                  filter === 'archive' ? (
                    <tr key={s.id} className="cursor-pointer hover:bg-au-card-2" tabIndex={0} onClick={() => openCard(s.id)} onKeyDown={(e) => e.key === 'Enter' && openCard(s.id)}>
                      <td><b className="text-au-ink">{s.name}</b></td>
                      <td className="whitespace-nowrap tabular-nums text-au-muted">{s.phone || '—'}</td>
                      <td className="tabular-nums">{s.archivedAt ? dmy(s.archivedAt) : '—'}</td>
                      <td>
                        <span className="sx-pl mute">{s.leaveReason ? reasonLabel(s.leaveReason) : t('noReason')}</span>
                        {s.leaveNote && <div className="mt-1 text-xs text-au-faint">{s.leaveNote}</div>}
                      </td>
                      <td className="text-xs text-au-muted">{s.archivedBy || '—'}</td>
                      <td className="text-right">{s.balance < 0 ? <b className="tabular-nums text-au-bad">{formatUZS(-s.balance)}</b> : '—'}</td>
                    </tr>
                  ) : (
                    <Row
                      key={s.id}
                      s={s}
                      today={today}
                      canEdit={data.canEdit}
                      onOpen={(pane) => openCard(s.id, pane)}
                      pick={pick ? { on: sel.has(s.id), toggle: () => toggle(s.id) } : undefined}
                      onFaol={() => setFaol([s])}
                      onUndo={undoing ? undefined : () => undoFaol(s)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        {chosen.length > 0 && (
          <div className="sticky bottom-3 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-au-ink px-4 py-2.5 text-sm text-au-card">
            <span>{t('nSelected', { n: chosen.length })}</span>
            <span className="flex-1" />
            <button className="sx-btn sm" onClick={() => setSel(new Set())}>
              {t('cancelShort')}
            </button>
            <button className="sx-btn sm primary" onClick={() => setFaol(chosen)}>
              {t('makeActive')}
            </button>
          </div>
        )}
        {rows.length > limit && (
          <div className="mt-3 flex justify-center">
            <button className="sx-btn" onClick={() => setLimit(limit + PAGE)}>
              {t('more', { n: Math.min(PAGE, rows.length - limit) })}
            </button>
          </div>
        )}
        <div className="mt-2 text-xs text-au-faint">
          {t('listNote')}
        </div>
      </div>

      {/* Qarzdorga qo'ng'iroq */}
      <div className="sx-card px-5 py-[18px]">
        <div className="sx-h">
          <h3>{t('callTitle')}</h3>
          <small>{t('callSub', { d: d.settings.callAfterDays, n: callList.length })}</small>
        </div>
        {callList.length === 0 ? (
          <div className="sx-empty">{t('noLongDebt')}</div>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {callList.slice(0, 12).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-au-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <b className="text-au-ink">{s.name}</b> <span className="tabular-nums text-sm font-bold text-au-bad">−{formatUZS(-s.balance)}</span>
                  <div className="text-xs text-au-faint">
                    {t('sinceDays', { n: s.grade.openDays })} · {s.parent || s.phone || t('noPhone')}
                    {s.lastCall && `${t('lastCall', { res: CALLS[s.lastCall.result], date: when(s.lastCall.at).slice(0, 10) })}${s.lastCall.promised ? t('promise', { date: dmy(s.lastCall.promised) }) : ''}`}
                  </div>
                </div>
                <button className="sx-btn sm" onClick={() => openCard(s.id, 'call')}>
                  <Phone className="size-4" /> {t('result')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {callList.length > 12 && <div className="mt-2 text-xs text-au-faint">{t('moreDebtors', { n: callList.length - 12 })}</div>}
      </div>

      {data.money && <Stats data={data} />}

      {current && open && (
        <StudentCardDrawer key={current.id} s={current} data={data} pane={open.pane} onClose={() => setOpen(null)} />
      )}
      {modal === 'tpl' && <TemplatesModal data={data} onClose={() => setModal(null)} />}
      {modal === 'settings' && <BillingSettingsModal data={data} onClose={() => setModal(null)} />}
      {faol && <PaidElsewhereModal students={faol} onClose={() => setFaol(null)} onDone={() => { setFaol(null); setSel(new Set()); }} />}
      {modal === 'log' && <LogModal data={data} onClose={() => setModal(null)} onOpen={(id) => { setModal(null); openCard(id); }} />}
    </div>
  );
}

export function LogItem({ l, onOpen }: { l: OpsData['students']['log'][number]; onOpen?: () => void }) {
  const [ic, tone] = LOG_ICON[l.kind] ?? LOG_ICON.edit;
  return (
    <li
      className={cn('flex min-w-0 items-start gap-2.5 rounded-xl border border-au-line bg-au-card-2/50 px-3 py-2', onOpen && 'cursor-pointer hover:border-au-faint')}
      onClick={onOpen}
    >
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-sm font-extrabold', tone)}>{ic}</span>
      <span className="min-w-0 text-[13px] leading-snug text-au-ink">
        {l.text}
        <span className="block text-xs text-au-faint">
          {l.actor} · {when(l.at)}
        </span>
      </span>
    </li>
  );
}

function Row({
  s,
  today,
  canEdit,
  onOpen,
  pick,
  onFaol,
  onUndo,
}: {
  s: StudentRow;
  today: string;
  canEdit: boolean;
  onOpen: (pane?: string) => void;
  pick?: { on: boolean; toggle: () => void };
  onFaol: () => void;
  onUndo?: () => void;
}) {
  const t = useTranslations('ops.stu');
  const to = useTranslations('ops');
  const { GRADE } = useOpsMeta();
  const g = GRADE[s.grade.grade];
  const next = s.start && s.status === 'active' ? nextDueDate(s.start, today) : null;
  const left = next ? daysBetween(today, next) : 0;
  return (
    <tr className={cn('cursor-pointer hover:bg-au-card-2', pick?.on && 'bg-au-card-2')} tabIndex={0} onClick={() => onOpen()} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      {pick && (
        <td onClick={(e) => e.stopPropagation()}>
          {isPending(s) && <input type="checkbox" aria-label={t('pick', { name: s.name })} checked={pick.on} onChange={pick.toggle} />}
        </td>
      )}
      <td>
        <b className="text-au-ink">{s.name}</b>
        <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
          {s.risk && (
            <span className="sx-pl bad" title={t('riskTip')}>
              <AlertTriangle className="size-3" /> {t('risk')}
            </span>
          )}
          {!s.tg && <span className="sx-pl mute" title={t('noTgTip')}>{t('noTg')}</span>}
        </span>
        {s.tgUsername && <div className="text-xs text-au-faint">@{s.tgUsername}</div>}
      </td>
      <td className="whitespace-nowrap tabular-nums text-au-muted">
        {s.phone || '—'}
        {s.father && <div className="text-xs text-au-faint">{t('father', { n: s.father })}</div>}
        {s.mother && <div className="text-xs text-au-faint">{t('mother', { n: s.mother })}</div>}
        {!s.father && !s.mother && s.parent && <div className="text-xs text-au-faint">{s.parent}</div>}
      </td>
      <td className="whitespace-nowrap">
        {isPending(s) ? (
          <span className="sx-pl warn">{t('notActiveWhy', { why: t(WHY[s.inactiveWhy] ?? 'whyNopay') })}</span>
        ) : s.balance < 0 ? (
          <b className="tabular-nums text-au-bad">−{som(-s.balance)}</b>
        ) : s.status === 'frozen' ? (
          <span className="sx-pl info">{t('frozen')}</span>
        ) : (
          <span className="sx-pl ok">{t('active')}{s.balance > 0 ? ` · +${formatUZS(s.balance)}` : ''}</span>
        )}
        {s.paidElsewhere && (
          <div className="mt-1 text-xs text-au-faint" title={`${dmy(s.paidElsewhere.at)}${s.paidElsewhere.by ? ` · ${s.paidElsewhere.by}` : ''}`}>
            {t('manualActive', { src: s.paidElsewhere.source })}
          </div>
        )}
      </td>
      <td>
        {s.grade.total === 0 ? (
          <span className="text-xs text-au-faint">{t('noPayYet')}</span>
        ) : (
          <>
            <span className={cn('sx-pl', g.tone)}>{g.n}</span>
            <div className="mt-1 text-xs text-au-faint">
              {t('onTime', { a: s.grade.onTime, b: s.grade.total, d: s.grade.avgDelay })}
            </div>
          </>
        )}
      </td>
      <td className="text-right">
        <b className="tabular-nums text-au-ink">{s.fee ? formatUZS(s.fee) : '—'}</b>
        {(s.discountPct > 0 || s.installments === 2) && (
          <div className="text-xs text-au-faint">
            {s.discountPct > 0 && `−${s.discountPct}%`}
            {s.discountPct > 0 && s.installments === 2 && ' · '}
            {s.installments === 2 && t('twoParts')}
          </div>
        )}
      </td>
      <td className="tabular-nums">
        {s.start ? (
          <>
            {dmy(s.start)}
            <div className="text-xs text-au-faint">{t('monthly', { d: Number(s.start.slice(8, 10)) })}</div>
          </>
        ) : (
          <span className="text-xs text-au-faint">{t('notSet')}</span>
        )}
        <div className="text-xs text-au-faint">{t('inGroup', { d: s.groupSince ? dmy(s.groupSince) : '—' })}</div>
        <div className="text-xs text-au-faint">{t('activeOn', { d: s.activeSince ? dmy(s.activeSince) : '—' })}</div>
      </td>
      <td>
        {s.status === 'frozen' ? (
          <span className="text-xs text-au-muted">{s.frozenUntil ? t('pausedUntil', { d: dmy(s.frozenUntil) }) : t('paused')}</span>
        ) : next ? (
          <>
            <span className="tabular-nums text-au-ink">{dmy(next)}</span>
            <div className={cn('text-xs', left <= 3 ? 'font-semibold text-au-accent' : 'text-au-faint')}>
              {left === 0 ? t('today') : t('daysLeft', { n: left })} · {formatUZS(s.fee + Math.max(0, -s.balance))}
            </div>
          </>
        ) : (
          '—'
        )}
      </td>
      {canEdit && (
        <td onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1.5">
            {isPending(s) && (
              <button className="sx-btn sm primary" title={t('paidElsewhereTip')} onClick={onFaol}>
                {t('makeOne')}
              </button>
            )}
            {s.paidElsewhere && (
              <button className="sx-btn sm" title={t('undoTip')} disabled={!onUndo} onClick={onUndo}>
                {to('c.cancel')}
              </button>
            )}
            <button className="sx-btn sm" title={to('c.edit')} aria-label={to('c.edit')} onClick={() => onOpen('info')}>
              <Pencil className="size-3.5" />
            </button>
            <button className="sx-btn sm" title={to('c.delete')} aria-label={to('c.delete')} onClick={() => onOpen('del')}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function Bars({ items, tone }: { items: { k: string; v: number; label: string; hot?: boolean }[]; tone: string }) {
  const max = Math.max(1, ...items.map((i) => i.v));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div key={i.k} className="grid grid-cols-[minmax(110px,170px)_1fr_auto] items-center gap-2.5 text-[13px]">
          <span className="truncate text-au-ink" title={i.k}>
            {i.k}
          </span>
          <span className="sx-hb">
            <i className={i.hot ? 'bg-au-bad' : tone} style={{ width: `${(i.v / max) * 100}%` }} />
          </span>
          <span className="tabular-nums text-au-muted">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function Stats({ data }: { data: OpsData }) {
  const t = useTranslations('ops.stu');
  const to = useTranslations('ops');
  const { METHODS, fixFor, reasonLabel } = useOpsMeta();
  const d = data.students;
  const live = d.rows.filter(isLive);
  const billed = live.filter((s) => s.active);
  const expected = billed.reduce((a, s) => a + s.fee, 0);
  const paid = billed.filter((s) => s.paidThisMonth).length;
  const pct = expected ? Math.min(100, Math.round((d.stats.collected / expected) * 100)) : 0;
  const graded = live.filter((s) => s.grade.total > 0);
  const cnt = { ok: 0, late: 0, hard: 0 };
  for (const s of graded) cnt[s.grade.grade]++;
  const tot = graded.length || 1;
  const aging = [
    { k: t('d1'), v: 0 },
    { k: t('d2'), v: 0 },
    { k: t('d3'), v: 0 },
  ];
  for (const s of live) if (s.balance < 0) aging[s.grade.openDays <= 7 ? 0 : s.grade.openDays <= 30 ? 1 : 2].v += -s.balance;
  const todayK = d.stats.kassa.filter((k) => k.today);
  const todayTotal = todayK.reduce((a, k) => a + k.amount, 0);
  const reasons = d.stats.reasons;
  const repeated = reasons.filter((r) => r.n >= 2);

  return (
    <div className="sx-grid">
      <div className="sx-card s12 !pb-2">
        <div className="sx-h !mb-0">
          <h3>{t('statsTitle')}</h3>
          <small>{t('monthOf', { m: dmy(`${d.stats.month}-01`).slice(3) })}</small>
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{t('payThis')}</h3>
        </div>
        <div className="text-[26px] font-bold tabular-nums text-au-ink">
          {paid} / {billed.length}
        </div>
        <div className="text-xs text-au-faint">{t('paidOf', { n: billed.length - paid })}</div>
        <div className="sx-hb mt-4">
          <i className="bg-au-ok" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-xs text-au-muted">
          {t('inPlanPct', { sum: som(d.stats.collected), plan: som(expected), pct })}
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{t('grade')}</h3>
          <small>{t('nStudents', { n: graded.length })}</small>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-au-card-2">
          <i className="bg-au-ok" style={{ width: `${(cnt.ok / tot) * 100}%` }} />
          <i className="bg-au-accent" style={{ width: `${(cnt.late / tot) * 100}%` }} />
          <i className="bg-au-bad" style={{ width: `${(cnt.hard / tot) * 100}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-au-muted">
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-au-ok" />{t('gradeOk', { n: cnt.ok })}</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-au-accent" />{t('gradeLate', { n: cnt.late })}</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-au-bad" />{t('gradeHard', { n: cnt.hard })}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-au-faint">
          {t('gradeNote')}
        </p>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{t('aging')}</h3>
        </div>
        <Bars tone="bg-au-bad" items={aging.map((a) => ({ k: a.k, v: a.v, label: formatUZS(a.v) }))} />
        <div className="sx-h !mb-2 mt-4">
          <h3 className="!text-sm">{to('c.payMethod')}</h3>
        </div>
        {d.stats.methods.length ? (
          <Bars tone="bg-au-accent" items={d.stats.methods.map((m) => ({ k: METHODS[m.method] ?? m.method, v: m.amount, label: formatUZS(m.amount) }))} />
        ) : (
          <div className="text-xs text-au-faint">{t('noPayMonth')}</div>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{t('kassa')}</h3>
          <small>{t('kassaSub', { sum: som(todayTotal) })}</small>
        </div>
        {todayK.length === 0 ? (
          <div className="sx-empty">{t('noPayToday')}</div>
        ) : (
          <table className="sx-tbl lt">
            <tbody>
              {todayK.map((k) => (
                <tr key={`${k.actor}-${k.method}`}>
                  <td className="text-au-ink">{k.actor}</td>
                  <td className="text-au-muted">{METHODS[k.method] ?? k.method} · {to('c.count', { n: k.count })}</td>
                  <td className="text-right font-bold tabular-nums">{formatUZS(k.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{t('exitReasons')}</h3>
          <small>{t('last90', { n: reasons.reduce((a, r) => a + r.n, 0) })}</small>
        </div>
        {reasons.length ? (
          <Bars tone="bg-au-faint" items={reasons.map((r) => ({ k: reasonLabel(r.reason), v: r.n, label: to('c.count', { n: r.n }), hot: r.n >= 3 }))} />
        ) : (
          <div className="sx-empty">{t('nobodyArchived')}</div>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{t('needFix')}</h3>
          <small>{t('repeatSub')}</small>
        </div>
        {repeated.length === 0 ? (
          <div className="sx-empty">{t('noRepeat')}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {repeated.map((r) => (
              <div key={r.reason} className={cn('rounded-xl border px-3 py-2.5', r.n >= 3 ? 'border-au-bad/50 bg-au-bad-soft' : 'border-au-line bg-au-card-2/50')}>
                <div className="flex items-center gap-2">
                  <b className="text-sm text-au-ink">{reasonLabel(r.reason)}</b>
                  <span className={cn('sx-pl', r.n >= 3 ? 'bad' : 'warn')}>{t('nTimes', { n: r.n })}</span>
                </div>
                <div className="mt-1 text-[13px] leading-snug text-au-muted">{fixFor(r.reason)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
