'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  OP_META,
  YM_RE,
  calculateEmployeeMonthSummary,
  formatUZS,
  getInitials,
  getPreviousMonth,
  shiftYearMonth,
  toSafeIntegerAmount,
  type MonEmp,
  type MonOp,
  type MonSummary,
  type MonTx,
} from '@/lib/monitor';
import {
  monitorAddOperationAction,
  monitorDeleteEntryAction,
  monitorToggleRequestAction,
} from '@/lib/actions/finance-monitor';
import { MoneyInput } from '@/components/ui/money-input';
import { useLocale, useTranslations } from 'next-intl';
import { monthName } from '@/lib/month-names';
import './monitor.css';

/**
 * Finance › Moliya — Monitor/index.html 1:1 (owner, 2026-11-12): bir xil
 * markup, klasslar (monitor.css) va mantiq (lib/monitor.ts); ma'lumot
 * localStorage o'rniga bazadan (lib/monitor-data.ts).
 */

type Filter = 'ALL' | 'REQUESTED' | 'PARTIAL' | 'UNPAID' | 'PAID';
type Row = { emp: MonEmp; curr: MonSummary; prev: MonSummary };

const PLACEHOLDERS: Record<MonOp, string> = { AVANS: 'phAvans', SALARY_PAY: 'phSalary', BONUS: 'phBonus', PENALTY: 'phPenalty' };
const ERRORS: Record<string, string> = {
  reasonRequired: 'eReason',
  periodLocked: 'eLocked',
  systemEntry: 'eSystem',
  notFound: 'eNotFound',
  forbidden: 'eForbidden',
  sessionExpired: 'eSession',
  invalidInput: 'eInvalid',
};
const OP_KEY: Record<MonOp, string> = { AVANS: 'opAvans', SALARY_PAY: 'opSalary', BONUS: 'opBonus', PENALTY: 'opPenalty' };

/** Month names, money and labels in the UI language. */
function useMon() {
  const t = useTranslations('mon');
  const locale = useLocale();
  const okYm = (ym: string) => !!ym && YM_RE.test(ym);
  const fmn = (ym: string) => (okYm(ym) ? monthName(locale, parseInt(ym.split('-')[1], 10)) : '—');
  const fm = (ym: string) => (okYm(ym) ? `${fmn(ym)} ${ym.slice(0, 4)}` : '—');
  const money = (n: number) => `${formatUZS(n, false)} ${t('uzs')}`;
  const statusText = (c: MonSummary) => t(c.status === 'PAID' ? 'stPaid' : c.status === 'PARTIAL' ? 'stPartial' : 'stUnpaid');
  const opLabel = (op: MonOp) => t(OP_KEY[op]);
  const errText = (e: string) => t(ERRORS[e] ?? 'eOther');
  return { t, fm, fmn, money, statusText, opLabel, errText };
}

function groupInput(v: string) {
  const n = toSafeIntegerAmount(v);
  return n > 0 ? formatUZS(n, false) : '';
}

/** Monitor's animateKpiValue: 280 ms ease-out count-up between values. */
function KpiValue({ value, className }: { value: number; className?: string }) {
  const { t } = useMon();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 280);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    if (a !== value) raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <strong className={`k-val num ${className ?? ''}`}>
      {formatUZS(shown, false)} <small>{t('uzs')}</small>
    </strong>
  );
}

export function MonitorView({ month, employees, transactions }: { month: string; employees: MonEmp[]; transactions: MonTx[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [opModal, setOpModal] = useState<{ type: MonOp; empId: string } | null>(null);
  const [empModal, setEmpModal] = useState<{ id: string | null } | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const toastId = useRef(0);
  const { t, fm, fmn, statusText, errText } = useMon();

  const currM = month;
  const prevM = getPreviousMonth(currM);
  const currMonthName = fmn(currM);
  const prevMonthName = fmn(prevM);

  const showToast = (msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3120);
  };
  const refresh = (empId?: string) => {
    if (empId) setFlash(empId);
    startTransition(() => router.refresh());
  };
  const goMonth = (ym: string) => {
    if (!YM_RE.test(ym)) return;
    startTransition(() => router.push(`${pathname}?month=${ym}`));
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash, transactions]);

  // Escape closes every overlay (Monitor's keydown handler).
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpModal(null);
      setEmpModal(null);
      setDrawer(null);
    };
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, []);

  const rowsData: Row[] = employees.map((emp) => ({
    emp,
    curr: calculateEmployeeMonthSummary(emp, transactions, currM),
    prev: calculateEmployeeMonthSummary(emp, transactions, prevM),
  }));

  let allNet = 0;
  let allPrevNet = 0;
  let allBonus = 0;
  let allPenalty = 0;
  let allPaid = 0;
  let allAvans = 0;
  let countRequested = 0;
  let countPartial = 0;
  let countUnpaid = 0;
  let countPaid = 0;
  for (const { curr, prev } of rowsData) {
    allNet += curr.netPayable;
    allPrevNet += prev.netPayable;
    allBonus += curr.bonusTotal;
    allPenalty += curr.penaltyTotal;
    allPaid += curr.totalPaid;
    allAvans += curr.avansTotal;
    if (curr.avansRequested) countRequested++;
    if (curr.status === 'PARTIAL') countPartial++;
    else if (curr.status === 'UNPAID') countUnpaid++;
    else if (curr.status === 'PAID') countPaid++;
  }
  const netAdj = allBonus - allPenalty;

  const q = search.trim().toLowerCase();
  const filteredRows = rowsData.filter(({ emp, curr }) => {
    if (filter === 'REQUESTED' && !curr.avansRequested) return false;
    if (filter === 'PARTIAL' && curr.status !== 'PARTIAL') return false;
    if (filter === 'UNPAID' && curr.status !== 'UNPAID') return false;
    if (filter === 'PAID' && curr.status !== 'PAID') return false;
    if (q && !`${emp.firstName} ${emp.lastName} ${emp.role}`.toLowerCase().includes(q)) return false;
    return true;
  });

  async function toggleReq(emp: MonEmp) {
    const res = await monitorToggleRequestAction(emp.id, currM);
    if ('error' in res) return showToast(errText(res.error));
    refresh(emp.id);
    showToast(
      res.flagged
        ? t('flagged', { name: emp.firstName, month: fm(currM) })
        : t('unflagged', { name: emp.firstName }),
    );
  }

  function openOperationModal(type: MonOp = 'AVANS', empId: string | null = null) {
    if (employees.length === 0) {
      showToast(t('addStaffFirst'));
      return;
    }
    setOpModal({ type, empId: empId || employees[0].id });
  }

  const drawerEmp = drawer ? employees.find((e) => e.id === drawer) : undefined;

  return (
    <div className="mon">
      <main className="shell">
        <header className="top">
          <div className="brand">
            <div className="logo" aria-hidden="true">
              M
            </div>
            <div>
              <div className="title-row">
                <h1>{t('title')}</h1>
                <span className="tag">{t('tag')}</span>
              </div>
              <p className="sub">{t('sub')}</p>
            </div>
          </div>

          <div className="actions">
            <div className="month-pill num" role="group" aria-label={t('monthPick')}>
              <button type="button" className="m-nav" title={t('prevTip')} aria-label={t('prev')} onClick={() => goMonth(shiftYearMonth(currM, -1))}>
                ‹
              </button>
              <label className="month-picker-wrap" title={t('calTip')}>
                <span className="month-display-text">{fm(currM)}</span>
                <span className="month-prev-inline">{t('prevInline', { m: prevMonthName })}</span>
                <input type="month" className="month-native-input" aria-label={t('reportMonth')} value={currM} onChange={(e) => goMonth(e.target.value)} />
              </label>
              <button type="button" className="m-nav" title={t('nextTip')} aria-label={t('next')} onClick={() => goMonth(shiftYearMonth(currM, 1))}>
                ›
              </button>
            </div>

            <button type="button" className="btn-ghost" onClick={() => setEmpModal({ id: null })}>
              {t('addStaff')}
            </button>
            <button type="button" className="btn-main" onClick={() => openOperationModal('AVANS')}>
              {t('addOp')}
            </button>
          </div>
        </header>

        <section className="kpis" aria-label={t('kpis')}>
          <div className="kpi">
            <span className="k-label">{t('salaryTotal', { m: currMonthName })}</span>
            <KpiValue value={allNet} />
            <div className="k-sub num">
              <span>{t('activeStaff', { n: employees.length })}</span>
              <span>•</span>
              <span>{t('formula')}</span>
            </div>
          </div>
          <div className="kpi">
            <span className="k-label">{t('bonusPenalty')}</span>
            <strong className={`k-val num ${netAdj > 0 ? 'accent-pos' : netAdj < 0 ? 'accent-neg' : ''}`}>
              {netAdj > 0 ? '+' : ''}
              {formatUZS(netAdj, false)} <small>{t('uzs')}</small>
            </strong>
            <div className="k-sub num">
              <span className="accent-pos">{t('bonusN', { n: formatUZS(allBonus, false) })}</span>
              <span>•</span>
              <span className="accent-neg">{t('penaltyN', { n: formatUZS(allPenalty, false) })}</span>
            </div>
          </div>
          <div className="kpi">
            <span className="k-label">{t('givenIn', { m: currMonthName })}</span>
            <KpiValue value={allPaid} />
            <div className="k-sub num">
              <span>{t('ofAdvance', { n: formatUZS(allAvans, false) })}</span>
              <button
                type="button"
                className="k-req-chip"
                title={t('reqTip')}
                style={{ display: countRequested > 0 ? 'inline-flex' : 'none' }}
                onClick={() => setFilter((f) => (f === 'REQUESTED' ? 'ALL' : 'REQUESTED'))}
              >
                {t('requested', { n: countRequested })}
              </button>
            </div>
          </div>
          <div className="kpi">
            <span className="k-label">{t('salaryTotal', { m: prevMonthName })}</span>
            <KpiValue value={allPrevNet} />
            <div className="k-sub num">
              <span>{t('prevCompare')}</span>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="bar">
            <div className="tabs" role="tablist" aria-label={t('filterLabel')}>
              <button type="button" className={`tab ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
                {t('fAll', { n: rowsData.length })}
              </button>
              <button type="button" className={`tab ${filter === 'REQUESTED' ? 'active' : ''}`} onClick={() => setFilter('REQUESTED')}>
                <span className="tab-dot-amber" />
                <span>{t('fReq', { n: countRequested })}</span>
              </button>
              <button type="button" className={`tab ${filter === 'PARTIAL' ? 'active' : ''}`} onClick={() => setFilter('PARTIAL')}>
                {t('fPartial', { n: countPartial })}
              </button>
              <button type="button" className={`tab ${filter === 'UNPAID' ? 'active' : ''}`} onClick={() => setFilter('UNPAID')}>
                {t('fUnpaid', { n: countUnpaid })}
              </button>
              <button type="button" className={`tab ${filter === 'PAID' ? 'active' : ''}`} onClick={() => setFilter('PAID')}>
                {t('fPaid', { n: countPaid })}
              </button>
            </div>
            <div className="search-wrap">
              <input type="text" className="search-input" placeholder={t('searchPh')} autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="button" className={`search-clear ${q ? 'show' : ''}`} title={t('clear')} aria-label={t('clearSearch')} onClick={() => setSearch('')}>
                ×
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table aria-label={t('tableLabel')}>
              <thead>
                <tr>
                  <th>{t('colStaff')}</th>
                  <th>{t('colSalary', { m: currMonthName })}</th>
                  <th>{t('colPrev', { m: prevMonthName })}</th>
                  <th>{t('colBP')}</th>
                  <th>{t('colGiven', { m: currMonthName })}</th>
                  <th>{t('colState')}</th>
                  <th style={{ textAlign: 'right' }}>{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-box">{t('empty')}</div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(({ emp, curr, prev }) => {
                    const salDiff = prev.netPayable > 0 ? curr.netPayable - prev.netPayable : 0;
                    return (
                      <tr key={emp.id} className={flash === emp.id ? 'row-flash' : ''}>
                        <td>
                          <div className="emp">
                            <span className="av">{getInitials(emp.firstName, emp.lastName)}</span>
                            <div>
                              <div className="e-name" title={t('detailTip')} onClick={() => setDrawer(emp.id)}>
                                {emp.firstName} {emp.lastName}
                              </div>
                              <div className="e-role">{emp.role}</div>
                            </div>
                          </div>
                        </td>
                        <td className="num">
                          <div className="sal-cell">
                            <div className="sal-main-line">
                              <span className="strong">{formatUZS(curr.netPayable, false)}</span>
                            </div>
                            {salDiff > 0 && <span className="sal-delta accent-pos num">{t('grew', { n: formatUZS(salDiff, false) })}</span>}
                            {salDiff < 0 && <span className="sal-delta accent-neg num">{t('fell', { n: formatUZS(salDiff, false) })}</span>}
                          </div>
                        </td>
                        <td className="num prev-cell" title={t('compareTip')} onClick={() => setDrawer(emp.id)}>
                          <div>
                            {t('salaryOf')} <b>{formatUZS(prev.netPayable, false)}</b>
                          </div>
                          <div className="muted">{t('givenOf', { n: formatUZS(prev.totalPaid, false) })}</div>
                        </td>
                        <td className="num">
                          {curr.bonusTotal > 0 && <span className="pill pos num">+{formatUZS(curr.bonusTotal, false)}</span>}
                          {curr.penaltyTotal > 0 && <span className="pill neg num">−{formatUZS(curr.penaltyTotal, false)}</span>}
                          {!curr.bonusTotal && !curr.penaltyTotal && <span className="muted">—</span>}
                        </td>
                        <td className="num">
                          <div className="paid-line">
                            <b>{formatUZS(curr.totalPaid, false)}</b>
                          </div>
                          {curr.totalPaid > 0 && (
                            <div className="paid-breakdown num">
                              {t('breakdown', { a: formatUZS(curr.avansTotal, false), s: formatUZS(curr.salaryPayTotal, false) })}
                            </div>
                          )}
                        </td>
                        <td className="num">
                          <div className="st-row">
                            <span className="st">{statusText(curr)}</span>
                            {curr.avansRequested && <span className="req-badge">{t('reqBadge')}</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row-btns">
                            <button
                              type="button"
                              className={curr.avansRequested ? 'rbtn req-toggle is-requested' : 'rbtn req-toggle'}
                              title={t('reqToggleTip')}
                              onClick={() => toggleReq(emp)}
                            >
                              {curr.avansRequested ? t('reqOn') : t('reqOff')}
                            </button>
                            <button type="button" className="rbtn primary-soft" onClick={() => openOperationModal('AVANS', emp.id)}>
                              {t('bAvans')}
                            </button>
                            <button type="button" className="rbtn" onClick={() => openOperationModal('SALARY_PAY', emp.id)}>
                              {t('bSalary')}
                            </button>
                            <button type="button" className="rbtn" onClick={() => openOperationModal('BONUS', emp.id)}>
                              {t('bBonus')}
                            </button>
                            <button type="button" className="rbtn" onClick={() => openOperationModal('PENALTY', emp.id)}>
                              {t('bPenalty')}
                            </button>
                            <button type="button" className="rbtn" onClick={() => setDrawer(emp.id)}>
                              {t('bHistory')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredRows.length > 0 && <TableFoot rows={filteredRows} prevMonthName={prevMonthName} />}
            </table>
          </div>
        </section>
      </main>

      {opModal && (
        <OperationModal
          key={`${opModal.type}${opModal.empId}`}
          init={opModal}
          employees={employees}
          transactions={transactions}
          currM={currM}
          onClose={() => setOpModal(null)}
          onDone={(empId, msg) => {
            setOpModal(null);
            refresh(empId);
            showToast(msg);
          }}
        />
      )}
      {empModal && (
        <EmployeeModal
          emp={empModal.id ? employees.find((e) => e.id === empModal.id) : undefined}
          onClose={() => setEmpModal(null)}
        />
      )}

      <div
        className={`drawer-backdrop ${drawerEmp ? 'open' : ''}`}
        aria-hidden={drawerEmp ? 'false' : 'true'}
        onClick={(e) => e.target === e.currentTarget && setDrawer(null)}
      >
        {drawerEmp && (
          <HistoryDrawer
            emp={drawerEmp}
            transactions={transactions}
            currM={currM}
            onClose={() => setDrawer(null)}
            onAvans={() => {
              setDrawer(null);
              openOperationModal('AVANS', drawerEmp.id);
            }}
            onEdit={() => {
              setDrawer(null);
              setEmpModal({ id: drawerEmp.id });
            }}
            onDeleted={() => {
              refresh(drawerEmp.id);
              showToast(t('deleted'));
            }}
            onError={(e) => showToast(errText(e))}
          />
        )}
      </div>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function TableFoot({ rows, prevMonthName }: { rows: Row[]; prevMonthName: string }) {
  const { t, money } = useMon();
  let sumNet = 0;
  let sumPrevNet = 0;
  let sumBonus = 0;
  let sumPenalty = 0;
  let sumPaid = 0;
  let sumReq = 0;
  for (const { curr, prev } of rows) {
    sumNet += curr.netPayable;
    sumPrevNet += prev.netPayable;
    sumBonus += curr.bonusTotal;
    sumPenalty += curr.penaltyTotal;
    sumPaid += curr.totalPaid;
    if (curr.avansRequested) sumReq++;
  }
  return (
    <tfoot>
      <tr className="num">
        <td>{t('footTotal', { n: rows.length })}</td>
        <td>{formatUZS(sumNet, false)}</td>
        <td>
          {t('footPrev', { m: prevMonthName, n: formatUZS(sumPrevNet, false) })}
        </td>
        <td>
          <span className="accent-pos">+{formatUZS(sumBonus, false)}</span> / <span className="accent-neg">−{formatUZS(sumPenalty, false)}</span>
        </td>
        <td>{money(sumPaid)}</td>
        <td />
        <td style={{ textAlign: 'right', fontWeight: 500 }} className="muted">
          {sumReq > 0 ? (
            <>
              {t('footReq')} <b className="accent-amber">{t('footReqN', { n: sumReq })}</b>
            </>
          ) : (
            t('footClosed')
          )}
        </td>
      </tr>
    </tfoot>
  );
}

/* ------------------------------------------------------------------ MODAL 1 */

function OperationModal({
  init,
  employees,
  transactions,
  currM,
  onClose,
  onDone,
}: {
  init: { type: MonOp; empId: string };
  employees: MonEmp[];
  transactions: MonTx[];
  currM: string;
  onClose: () => void;
  onDone: (empId: string, msg: string) => void;
}) {
  const prevM = getPreviousMonth(currM);
  const { t, fm, money, opLabel, errText } = useMon();
  const [type, setType] = useState<MonOp>(init.type);
  const [empId, setEmpId] = useState(init.empId);
  const [target, setTarget] = useState(currM);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<{ field: 'amount' | 'reason' | null; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const emp = employees.find((e) => e.id === empId);
  const summary = emp && YM_RE.test(target) ? calculateEmployeeMonthSummary(emp, transactions, target) : null;
  const amt = toSafeIntegerAmount(amount);
  // Every operation moves the month's pay: avans / oylik / bonus add, jarima subtracts.
  const nextNet = summary ? summary.netPayable + (type === 'PENALTY' ? -amt : amt) : null;
  const periodText = `${fm(target)}${target === currM ? t('curMonth') : target === prevM ? t('prevMonth') : ''}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!emp) return setErr({ field: null, msg: t('pickStaff') });
    if (!YM_RE.test(target)) return setErr({ field: null, msg: t('pickMonth') });
    if (amt <= 0) {
      amountRef.current?.focus();
      return setErr({ field: 'amount', msg: t('amountGt0') });
    }
    if (reason.trim().length < 3) {
      reasonRef.current?.focus();
      return setErr({
        field: 'reason',
        msg: type === 'AVANS' ? t('reasonAvans') : t('eReason'),
      });
    }
    setBusy(true);
    const res = await monitorAddOperationAction({ staffId: emp.id, type, amount: amt, month: target, reason: reason.trim() });
    setBusy(false);
    if ('error' in res) return setErr({ field: null, msg: errText(res.error) });
    const extra = res.clearedRequest ? t('clearedReq') : '';
    onDone(emp.id, `${t('written', { name: emp.firstName, month: fm(target), sum: money(amt), op: opLabel(type) })}${extra}`);
  }

  return (
    <div className="backdrop open" role="dialog" aria-modal="true" aria-labelledby="opModalTitle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="m-head">
          <h2 id="opModalTitle">{t('opTitle')}</h2>
          <button type="button" className="m-close" aria-label={t('close')} onClick={onClose}>
            ×
          </button>
        </div>
        <form noValidate onSubmit={submit}>
          <div className="m-body">
            <div className="f-group">
              <span className="f-label">{t('pickType')}</span>
              <div className="op-grid">
                {(['AVANS', 'SALARY_PAY', 'BONUS', 'PENALTY'] as const).map((op) => (
                  <button key={op} type="button" className={`op-btn ${type === op ? 'selected' : ''}`} onClick={() => setType(op)}>
                    {t(op === 'AVANS' ? 'tAvans' : op === 'SALARY_PAY' ? 'tSalary' : op === 'BONUS' ? 'tBonus' : 'tPenalty')}
                  </button>
                ))}
              </div>
            </div>

            <div className="f-group">
              <label className="f-label" htmlFor="opEmployeeSelect">
                {t('staffName')}
              </label>
              <select id="opEmployeeSelect" className="f-select" required value={empId} onChange={(e) => setEmpId(e.target.value)}>
                {employees.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.firstName} {x.lastName} — {x.role}
                  </option>
                ))}
              </select>
            </div>

            <div className={`req-notice ${summary?.avansRequested && type === 'AVANS' ? 'show' : ''}`}>
              <span>{t('reqNotice')}</span>
            </div>

            <div className="f-group">
              <label className="f-label" htmlFor="opTargetMonth">
                {t('whichMonth')}
              </label>
              <div className="period-chips">
                <button type="button" className={`p-chip ${target === prevM ? 'active' : ''}`} onClick={() => setTarget(prevM)}>
                  <small>{t('toPrev')}</small>
                  <strong className="num">{fm(prevM)}</strong>
                </button>
                <button type="button" className={`p-chip ${target === currM ? 'active' : ''}`} onClick={() => setTarget(currM)}>
                  <small>{t('toCurr')}</small>
                  <strong className="num">{fm(currM)}</strong>
                </button>
                <input type="month" id="opTargetMonth" className="f-input num" style={{ minWidth: 142 }} required value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>

            <div className="f-group">
              <div className="f-label">
                <label htmlFor="opAmountInput">
                  {t('amountLabel')} <span className="req-star">*</span>
                </label>
              </div>
              <MoneyInput
                ref={amountRef}
                id="opAmountInput"
                className={`f-input num strong ${err?.field === 'amount' ? 'input-invalid' : ''}`}
                placeholder={t('amountPh')}
                required
                value={toSafeIntegerAmount(amount) || null}
                onValue={(v) => {
                  setAmount(v == null ? '' : groupInput(String(v)));
                  if (err?.field === 'amount') setErr(null);
                }}
              />
            </div>

            <div className="f-group">
              <div className="f-label">
                <label htmlFor="opReasonInput">
                  {t('reasonLabel')} <span className="req-star">*</span>
                </label>
                <span className="muted" style={{ fontSize: 11 }}>
                  {t('required')}
                </span>
              </div>
              <textarea
                ref={reasonRef}
                id="opReasonInput"
                className={`f-textarea ${err?.field === 'reason' ? 'input-invalid' : ''}`}
                rows={2}
                placeholder={t(PLACEHOLDERS[type])}
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim().length >= 3 && err?.field === 'reason') setErr(null);
                }}
              />
            </div>

            <div className="preview-box num">
              <div className="preview-line">
                <span className="muted">{t('affects')}</span>
                <strong>{periodText}</strong>
              </div>
              <div className="preview-line">
                <span className="muted">{t('nowSalary')}</span>
                <strong>{summary ? money(summary.netPayable) : '—'}</strong>
              </div>
              <div className="preview-line">
                <span className="muted">{t('afterSalary')}</span>
                <strong>{nextNet === null ? '—' : money(nextNet)}</strong>
              </div>
            </div>

            <div className={`form-err ${err ? 'show' : ''}`} role="alert">
              {err?.msg}
            </div>
          </div>

          <div className="m-foot">
            <div className="m-foot-right">
              <button type="button" className="btn-ghost" onClick={onClose}>
                {t('cancel')}
              </button>
              <button type="submit" className="btn-main" disabled={busy}>
                {t('confirm')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Monitor's employee modal. Staff accounts live in Xodimlar (login,
 * role, contract); there is no fixed salary to set (2026-11-18), so this
 * only shows the person and opens the profile. */
function EmployeeModal({
  emp,
  onClose,
}: {
  emp: MonEmp | undefined;
  onClose: () => void;
}) {
  const { t } = useMon();
  return (
    <div className="backdrop open" role="dialog" aria-modal="true" aria-labelledby="empModalTitle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="m-head">
          <h2 id="empModalTitle">{emp ? t('editStaff') : t('newStaff')}</h2>
          <button type="button" className="m-close" aria-label={t('close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div>
          <div className="m-body">
            {emp ? (
              <>
                <div className="f-row-2">
                  <div className="f-group">
                    <label className="f-label" htmlFor="empFirstName">
                      {t('firstName')}
                    </label>
                    <input type="text" id="empFirstName" className="f-input" value={emp.firstName} disabled />
                  </div>
                  <div className="f-group">
                    <label className="f-label" htmlFor="empLastName">
                      {t('lastName')}
                    </label>
                    <input type="text" id="empLastName" className="f-input" value={emp.lastName} disabled />
                  </div>
                </div>
                <div className="f-group">
                  <label className="f-label" htmlFor="empRole">
                    {t('role')}
                  </label>
                  <input type="text" id="empRole" className="f-input" value={emp.role} disabled />
                </div>
              </>
            ) : (
              <div className="ceo-note">
                {t('ceoNote')}
              </div>
            )}
          </div>
          <div className="m-foot">
            {emp ? (
              <Link href={`/profile/${emp.id}`} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {t('openProfile')}
              </Link>
            ) : (
              <span />
            )}
            <div className="m-foot-right">
              <button type="button" className="btn-ghost" onClick={onClose}>
                {t('cancel')}
              </button>
              {emp ? null : (
                <Link href="/staff" className="btn-main" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {t('toStaff')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ DRAWER */

function HistoryDrawer({
  emp,
  transactions,
  currM,
  onClose,
  onAvans,
  onEdit,
  onDeleted,
  onError,
}: {
  emp: MonEmp;
  transactions: MonTx[];
  currM: string;
  onClose: () => void;
  onAvans: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { t, fm, money, opLabel } = useMon();
  const prevM = getPreviousMonth(currM);
  const curr = calculateEmployeeMonthSummary(emp, transactions, currM);
  const prev = calculateEmployeeMonthSummary(emp, transactions, prevM);
  const empTxs = transactions.filter((t) => t.staffId === emp.id).slice().reverse();

  const card = (label: string, sum: MonSummary, isCurrent: boolean) => (
    <div className={`d-card ${isCurrent ? 'curr' : ''} num`}>
      <div className="d-card-title">
        {label} — {fm(sum.period)}
      </div>
      <div className="d-line">
        <span className="muted">{t('dAvans')}</span>
        <strong>{money(sum.avansTotal)}</strong>
      </div>
      <div className="d-line">
        <span className="muted">{t('dSalary')}</span>
        <strong>{money(sum.salaryPayTotal)}</strong>
      </div>
      <div className="d-line">
        <span className="muted">{t('dBonus')}</span>
        <strong className="accent-pos">+{money(sum.bonusTotal)}</strong>
      </div>
      <div className="d-line">
        <span className="muted">{t('dPenalty')}</span>
        <strong className="accent-neg">−{money(sum.penaltyTotal)}</strong>
      </div>
      <div className="d-line sep">
        <span>{t('dNet')}</span>
        <span>{money(sum.netPayable)}</span>
      </div>
    </div>
  );

  return (
    <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerEmpTitle">
      <div className="m-head">
        <div>
          <h2 id="drawerEmpTitle">
            {emp.firstName} {emp.lastName}
          </h2>
          <p className="sub">
            {emp.role} • {t('drawerSub', { m: fm(currM), n: money(curr.netPayable) })}
            {curr.avansRequested ? t('drawerReq') : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="rbtn primary-soft" onClick={onAvans}>
            {t('bAvans')}
          </button>
          <button type="button" className="rbtn" onClick={onEdit}>
            {t('edit')}
          </button>
          <button type="button" className="m-close" aria-label={t('close')} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="d-body">
        <div className="d-compare">
          {card(t('cardPrev'), prev, false)}
          {card(t('cardCurr'), curr, true)}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 13.5 }}>{t('journal')}</strong>
            <span className="tag num">{t('nRecords', { n: empTxs.length })}</span>
          </div>
          <div className="tx-list">
            {empTxs.length === 0 ? (
              <div className="empty-box" style={{ padding: 22 }}>
                {t('noOps')}
              </div>
            ) : (
              empTxs.map((tx) => {
                const meta = OP_META[tx.type];
                const colorCls = tx.shift ? '' : tx.type === 'BONUS' ? 'accent-pos' : tx.type === 'PENALTY' ? 'accent-neg' : '';
                const prefix = tx.type === 'BONUS' ? '+' : tx.type === 'PENALTY' ? '−' : '';
                return (
                  <div key={tx.id} className="tx-card">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className={`pill ${meta.pillCls}`} style={{ border: '1px solid var(--border-light)' }}>
                          {tx.shift ? t('advAccount') : opLabel(tx.type)}
                        </span>
                        <span className="tag num">{t('forMonth', { m: fm(tx.month) })}</span>
                        {tx.auto && <span className="tag">{t('auto')}</span>}
                      </div>
                      <div className="tx-reason">{t('noteOf', { n: tx.reason })}</div>
                      <div className="tx-date num">{t('dateOf', { n: tx.createdAt || '—' })}</div>
                    </div>
                    <div className="tx-right num">
                      <strong className={colorCls} style={{ fontSize: 14 }}>
                        {prefix}
                        {money(tx.amount)}
                      </strong>
                      {tx.entryId && (
                        <button
                          type="button"
                          className="tx-del"
                          title={t('delTip')}
                          disabled={busy === tx.entryId}
                          onClick={async () => {
                            setBusy(tx.entryId);
                            const res = await monitorDeleteEntryAction(tx.entryId!);
                            setBusy(null);
                            if ('error' in res) onError(res.error);
                            else onDeleted();
                          }}
                        >
                          {t('delete')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
