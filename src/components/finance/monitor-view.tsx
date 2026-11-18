'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  OP_META,
  YM_RE,
  calculateEmployeeMonthSummary,
  formatMonthNameOnly,
  formatMonthUz,
  formatUZS,
  getInitials,
  getPreviousMonth,
  getStatusText,
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
import './monitor.css';

/**
 * Finance › Moliya — Monitor/index.html 1:1 (owner, 2026-11-12): bir xil
 * markup, klasslar (monitor.css) va mantiq (lib/monitor.ts); ma'lumot
 * localStorage o'rniga bazadan (lib/monitor-data.ts).
 */

type Filter = 'ALL' | 'REQUESTED' | 'PARTIAL' | 'UNPAID' | 'PAID';
type Row = { emp: MonEmp; curr: MonSummary; prev: MonSummary };

const PLACEHOLDERS: Record<MonOp, string> = {
  AVANS: "Masalan: Noyabr oyi 1-qism avansi (xodim so'roviga asosan)...",
  SALARY_PAY: "Masalan: Oy yakuni bo'yicha qolgan oylik maosh to'lab berildi...",
  BONUS: 'Masalan: Yuqori natijali o‘quvchilar va yangi guruh uchun bonus...',
  PENALTY: 'Masalan: Darsga kechikkani yoki hisobot topshirmagani uchun jarima...',
};

const ERRORS: Record<string, string> = {
  reasonRequired: "Buxgalteriya tartibiga ko'ra izoh (sabab) yozish majburiy!",
  periodLocked: 'Bu oy yopilgan — o‘zgartirib bo‘lmaydi.',
  systemEntry: 'Bu yozuv boshqa bo‘limdan keladi — o‘sha yerda o‘zgartiring.',
  notFound: 'Yozuv topilmadi.',
  forbidden: 'Ruxsat yo‘q.',
  sessionExpired: 'Sessiya tugagan — qayta kiring.',
  invalidInput: "Ma'lumot noto'g'ri.",
};
const errText = (e: string) => ERRORS[e] ?? 'Saqlab bo‘lmadi. Qayta urinib ko‘ring.';

function groupInput(v: string) {
  const n = toSafeIntegerAmount(v);
  return n > 0 ? formatUZS(n, false) : '';
}

/** Monitor's animateKpiValue: 280 ms ease-out count-up between values. */
function KpiValue({ value, className }: { value: number; className?: string }) {
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
      {formatUZS(shown, false)} <small>so&apos;m</small>
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

  const currM = month;
  const prevM = getPreviousMonth(currM);
  const currMonthName = formatMonthNameOnly(currM);
  const prevMonthName = formatMonthNameOnly(prevM);

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

  const rowsData: Row[] = useMemo(
    () =>
      employees.map((emp) => ({
        emp,
        curr: calculateEmployeeMonthSummary(emp, transactions, currM),
        prev: calculateEmployeeMonthSummary(emp, transactions, prevM),
      })),
    [employees, transactions, currM, prevM],
  );

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
        ? `${emp.firstName}: "${formatMonthUz(currM)}" uchun Avans so'raldi deb belgilandi`
        : `${emp.firstName}: "Avans so'raldi" belgisi olib tashlandi`,
    );
  }

  function openOperationModal(type: MonOp = 'AVANS', empId: string | null = null) {
    if (employees.length === 0) {
      showToast("Avval kamida bitta xodim qo'shing");
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
                <h1>O&apos;quv Markazi Moliya Bo&apos;limi</h1>
                <span className="tag">Minimal</span>
              </div>
              <p className="sub">Oylik = oy davomida berilgan avans va oylik + bonus − jarima. Fix oylik yo&apos;q.</p>
            </div>
          </div>

          <div className="actions">
            <div className="month-pill num" role="group" aria-label="Hisobot oyi tanlovi">
              <button type="button" className="m-nav" title="Oldingi oyga o'tish" aria-label="Oldingi oy" onClick={() => goMonth(shiftYearMonth(currM, -1))}>
                ‹
              </button>
              <label className="month-picker-wrap" title="Kalendardan istalgan oyni tanlash">
                <span className="month-display-text">{formatMonthUz(currM)}</span>
                <span className="month-prev-inline">(Oldingi: {prevMonthName})</span>
                <input type="month" className="month-native-input" aria-label="Hisobot oyi" value={currM} onChange={(e) => goMonth(e.target.value)} />
              </label>
              <button type="button" className="m-nav" title="Keyingi (yangi) oyga o'tish" aria-label="Keyingi oy" onClick={() => goMonth(shiftYearMonth(currM, 1))}>
                ›
              </button>
            </div>

            <button type="button" className="btn-ghost" onClick={() => setEmpModal({ id: null })}>
              + Xodim
            </button>
            <button type="button" className="btn-main" onClick={() => openOperationModal('AVANS')}>
              + Avans / Amal qo&apos;shish
            </button>
          </div>
        </header>

        <section className="kpis" aria-label="Asosiy moliyaviy ko'rsatkichlar">
          <div className="kpi">
            <span className="k-label">{currMonthName} oyligi (jami)</span>
            <KpiValue value={allNet} />
            <div className="k-sub num">
              <span>{employees.length} ta faol xodim</span>
              <span>•</span>
              <span>berilgan + bonus − jarima</span>
            </div>
          </div>
          <div className="kpi">
            <span className="k-label">Bonus va Jarimalar</span>
            <strong className={`k-val num ${netAdj > 0 ? 'accent-pos' : netAdj < 0 ? 'accent-neg' : ''}`}>
              {netAdj > 0 ? '+' : ''}
              {formatUZS(netAdj, false)} <small>so&apos;m</small>
            </strong>
            <div className="k-sub num">
              <span className="accent-pos">+{formatUZS(allBonus, false)} bonus</span>
              <span>•</span>
              <span className="accent-neg">−{formatUZS(allPenalty, false)} jarima</span>
            </div>
          </div>
          <div className="kpi">
            <span className="k-label">{currMonthName} oyida berilgan</span>
            <KpiValue value={allPaid} />
            <div className="k-sub num">
              <span>Shundan avans: {formatUZS(allAvans, false)}</span>
              <button
                type="button"
                className="k-req-chip"
                title="Avans so'ragan xodimlarni filtrlash"
                style={{ display: countRequested > 0 ? 'inline-flex' : 'none' }}
                onClick={() => setFilter((f) => (f === 'REQUESTED' ? 'ALL' : 'REQUESTED'))}
              >
                Avans so&apos;ralgan: {countRequested}
              </button>
            </div>
          </div>
          <div className="kpi">
            <span className="k-label">{prevMonthName} oyligi (jami)</span>
            <KpiValue value={allPrevNet} />
            <div className="k-sub num">
              <span>Oldingi oy, taqqoslash uchun</span>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="bar">
            <div className="tabs" role="tablist" aria-label="Xodimlar holati filtri">
              <button type="button" className={`tab ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
                Barchasi ({rowsData.length})
              </button>
              <button type="button" className={`tab ${filter === 'REQUESTED' ? 'active' : ''}`} onClick={() => setFilter('REQUESTED')}>
                <span className="tab-dot-amber" />
                <span>Avans so&apos;ralgan ({countRequested})</span>
              </button>
              <button type="button" className={`tab ${filter === 'PARTIAL' ? 'active' : ''}`} onClick={() => setFilter('PARTIAL')}>
                Avans olgan ({countPartial})
              </button>
              <button type="button" className={`tab ${filter === 'UNPAID' ? 'active' : ''}`} onClick={() => setFilter('UNPAID')}>
                Hali berilmagan ({countUnpaid})
              </button>
              <button type="button" className={`tab ${filter === 'PAID' ? 'active' : ''}`} onClick={() => setFilter('PAID')}>
                Oylik berilgan ({countPaid})
              </button>
            </div>
            <div className="search-wrap">
              <input type="text" className="search-input" placeholder="Ism yoki lavozim izlash..." autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="button" className={`search-clear ${q ? 'show' : ''}`} title="Tozalash" aria-label="Qidiruvni tozalash" onClick={() => setSearch('')}>
                ×
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table aria-label="Xodimlar oylik hisob-kitob jadvali">
              <thead>
                <tr>
                  <th>Xodim</th>
                  <th>Oylik ({currMonthName})</th>
                  <th>Oldingi oy ({prevMonthName})</th>
                  <th>Bonus / Jarima</th>
                  <th>Berilgan ({currMonthName})</th>
                  <th>Holat</th>
                  <th style={{ textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-box">Tanlangan filtr yoki qidiruv bo&apos;yicha xodimlar topilmadi.</div>
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
                              <div className="e-name" title="Batafsil tarix va oylar hisobi" onClick={() => setDrawer(emp.id)}>
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
                            {salDiff > 0 && <span className="sal-delta accent-pos num">+{formatUZS(salDiff, false)} o&apos;sgan</span>}
                            {salDiff < 0 && <span className="sal-delta accent-neg num">{formatUZS(salDiff, false)} kamaygan</span>}
                          </div>
                        </td>
                        <td className="num prev-cell" title="Oldingi va hozirgi oy taqqoslamasini ko'rish" onClick={() => setDrawer(emp.id)}>
                          <div>
                            Oylik: <b>{formatUZS(prev.netPayable, false)}</b>
                          </div>
                          <div className="muted">Berilgan: {formatUZS(prev.totalPaid, false)}</div>
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
                              Avans: {formatUZS(curr.avansTotal, false)} • Oylik: {formatUZS(curr.salaryPayTotal, false)}
                            </div>
                          )}
                        </td>
                        <td className="num">
                          <div className="st-row">
                            <span className="st">{getStatusText(curr)}</span>
                            {curr.avansRequested && <span className="req-badge">✓ Avans so&apos;raldi</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row-btns">
                            <button
                              type="button"
                              className={curr.avansRequested ? 'rbtn req-toggle is-requested' : 'rbtn req-toggle'}
                              title="Xodim avans so'raganini belgilash yoki bekor qilish"
                              onClick={() => toggleReq(emp)}
                            >
                              {curr.avansRequested ? "✓ Avans so'raldi" : "Avans so'raldi"}
                            </button>
                            <button type="button" className="rbtn primary-soft" onClick={() => openOperationModal('AVANS', emp.id)}>
                              + Avans
                            </button>
                            <button type="button" className="rbtn" onClick={() => openOperationModal('SALARY_PAY', emp.id)}>
                              + Oylik
                            </button>
                            <button type="button" className="rbtn" onClick={() => openOperationModal('BONUS', emp.id)}>
                              + Bonus
                            </button>
                            <button type="button" className="rbtn" onClick={() => openOperationModal('PENALTY', emp.id)}>
                              − Jarima
                            </button>
                            <button type="button" className="rbtn" onClick={() => setDrawer(emp.id)}>
                              Tarix
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
              showToast("Operatsiya o'chirildi va barcha hisoblar yangilandi");
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
        <td>JAMI XULOSA ({rows.length} xodim)</td>
        <td>{formatUZS(sumNet, false)}</td>
        <td>
          {prevMonthName} oyligi: {formatUZS(sumPrevNet, false)}
        </td>
        <td>
          <span className="accent-pos">+{formatUZS(sumBonus, false)}</span> / <span className="accent-neg">−{formatUZS(sumPenalty, false)}</span>
        </td>
        <td>{formatUZS(sumPaid)}</td>
        <td />
        <td style={{ textAlign: 'right', fontWeight: 500 }} className="muted">
          {sumReq > 0 ? (
            <>
              Avans so&apos;raganlar: <b className="accent-amber">{sumReq} ta</b>
            </>
          ) : (
            "So'rovlar yopilgan"
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
  const periodText = `${formatMonthUz(target)}${target === currM ? ' (Hozirgi oy)' : target === prevM ? ' (Oldingi oy)' : ''}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!emp) return setErr({ field: null, msg: 'Iltimos, xodimni tanlang.' });
    if (!YM_RE.test(target)) return setErr({ field: null, msg: 'Iltimos, amal qaysi oyga tegishli ekanligini tanlang.' });
    if (amt <= 0) {
      amountRef.current?.focus();
      return setErr({ field: 'amount', msg: "Miqdor 0 dan katta so'm bo'lishi shart." });
    }
    if (reason.trim().length < 3) {
      reasonRef.current?.focus();
      return setErr({
        field: 'reason',
        msg: type === 'AVANS' ? "Avans qo'shayotganda izoh (sabab) yozish majburiy! Kamida 3 ta belgi kiriting." : "Buxgalteriya tartibiga ko'ra izoh (sabab) yozish majburiy!",
      });
    }
    setBusy(true);
    const res = await monitorAddOperationAction({ staffId: emp.id, type, amount: amt, month: target, reason: reason.trim() });
    setBusy(false);
    if ('error' in res) return setErr({ field: null, msg: errText(res.error) });
    const extra = res.clearedRequest ? " ('Avans so'raldi' belgisi yopildi)" : '';
    onDone(emp.id, `${emp.firstName}: ${formatMonthUz(target)} hisobiga ${formatUZS(amt)} (${OP_META[type].label}) yozildi${extra}`);
  }

  return (
    <div className="backdrop open" role="dialog" aria-modal="true" aria-labelledby="opModalTitle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="m-head">
          <h2 id="opModalTitle">Avans va Moliyaviy Amal Qo&apos;shish</h2>
          <button type="button" className="m-close" aria-label="Yopish" onClick={onClose}>
            ×
          </button>
        </div>
        <form noValidate onSubmit={submit}>
          <div className="m-body">
            <div className="f-group">
              <span className="f-label">Amal turini tanlang</span>
              <div className="op-grid">
                {(['AVANS', 'SALARY_PAY', 'BONUS', 'PENALTY'] as const).map((t) => (
                  <button key={t} type="button" className={`op-btn ${type === t ? 'selected' : ''}`} onClick={() => setType(t)}>
                    {t === 'AVANS' ? 'Avans berish' : t === 'SALARY_PAY' ? "Oylik to'lov" : t === 'BONUS' ? '+ Bonus' : '− Jarima'}
                  </button>
                ))}
              </div>
            </div>

            <div className="f-group">
              <label className="f-label" htmlFor="opEmployeeSelect">
                Xodim (Ism va Familiya)
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
              <span>Ushbu xodim uchun &quot;Avans so&apos;raldi&quot; belgisi yoqilgan. Avans yozilgach so&apos;rov bajarildi deb yopiladi.</span>
            </div>

            <div className="f-group">
              <label className="f-label" htmlFor="opTargetMonth">
                Qaysi oy hisobiga yoziladi?
              </label>
              <div className="period-chips">
                <button type="button" className={`p-chip ${target === prevM ? 'active' : ''}`} onClick={() => setTarget(prevM)}>
                  <small>Oldingi oyga</small>
                  <strong className="num">{formatMonthUz(prevM)}</strong>
                </button>
                <button type="button" className={`p-chip ${target === currM ? 'active' : ''}`} onClick={() => setTarget(currM)}>
                  <small>Hozirgi oyga</small>
                  <strong className="num">{formatMonthUz(currM)}</strong>
                </button>
                <input type="month" id="opTargetMonth" className="f-input num" style={{ minWidth: 142 }} required value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>

            <div className="f-group">
              <div className="f-label">
                <label htmlFor="opAmountInput">
                  Miqdori (so&apos;mda) <span className="req-star">*</span>
                </label>
              </div>
              <MoneyInput
                ref={amountRef}
                id="opAmountInput"
                className={`f-input num strong ${err?.field === 'amount' ? 'input-invalid' : ''}`}
                placeholder="Masalan: 1,500,000"
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
                  Izoh / Sababi (Albatta yozilishi shart) <span className="req-star">*</span>
                </label>
                <span className="muted" style={{ fontSize: 11 }}>
                  Majburiy maydon
                </span>
              </div>
              <textarea
                ref={reasonRef}
                id="opReasonInput"
                className={`f-textarea ${err?.field === 'reason' ? 'input-invalid' : ''}`}
                rows={2}
                placeholder={PLACEHOLDERS[type]}
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
                <span className="muted">Ta&apos;sir qiladigan davr:</span>
                <strong>{periodText}</strong>
              </div>
              <div className="preview-line">
                <span className="muted">Shu oy oyligi (hozir):</span>
                <strong>{summary ? formatUZS(summary.netPayable) : '—'}</strong>
              </div>
              <div className="preview-line">
                <span className="muted">Amaldan keyin oylik:</span>
                <strong>{nextNet === null ? '—' : formatUZS(nextNet)}</strong>
              </div>
            </div>

            <div className={`form-err ${err ? 'show' : ''}`} role="alert">
              {err?.msg}
            </div>
          </div>

          <div className="m-foot">
            <div className="m-foot-right">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Bekor qilish
              </button>
              <button type="submit" className="btn-main" disabled={busy}>
                Tasdiqlash va hisobga yozish
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

  return (
    <div className="backdrop open" role="dialog" aria-modal="true" aria-labelledby="empModalTitle" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="m-head">
          <h2 id="empModalTitle">{emp ? "Xodim Ma'lumotlarini Tahrirlash" : "Yangi Xodim Qo'shish"}</h2>
          <button type="button" className="m-close" aria-label="Yopish" onClick={onClose}>
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
                      Ismi
                    </label>
                    <input type="text" id="empFirstName" className="f-input" value={emp.firstName} disabled />
                  </div>
                  <div className="f-group">
                    <label className="f-label" htmlFor="empLastName">
                      Familiyasi
                    </label>
                    <input type="text" id="empLastName" className="f-input" value={emp.lastName} disabled />
                  </div>
                </div>
                <div className="f-group">
                  <label className="f-label" htmlFor="empRole">
                    Lavozimi / Yo&apos;nalishi
                  </label>
                  <input type="text" id="empRole" className="f-input" value={emp.role} disabled />
                </div>
              </>
            ) : (
              <div className="ceo-note">
                Yangi xodim akkaunti (login, lavozim, shartnoma) Xodimlar bo&apos;limida ochiladi. Qo&apos;shilgach u shu jadvalda paydo bo&apos;ladi — avans, oylik, bonus va jarimani «+ Avans / Amal qo&apos;shish» orqali yozing.
              </div>
            )}
          </div>
          <div className="m-foot">
            {emp ? (
              <Link href={`/profile/${emp.id}`} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
                Profilni ochish
              </Link>
            ) : (
              <span />
            )}
            <div className="m-foot-right">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Bekor qilish
              </button>
              {emp ? null : (
                <Link href="/staff" className="btn-main" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  Xodimlar bo&apos;limiga o&apos;tish
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
  const prevM = getPreviousMonth(currM);
  const curr = calculateEmployeeMonthSummary(emp, transactions, currM);
  const prev = calculateEmployeeMonthSummary(emp, transactions, prevM);
  const empTxs = transactions.filter((t) => t.staffId === emp.id).slice().reverse();

  const card = (label: string, sum: MonSummary, isCurrent: boolean) => (
    <div className={`d-card ${isCurrent ? 'curr' : ''} num`}>
      <div className="d-card-title">
        {label} — {formatMonthUz(sum.period)}
      </div>
      <div className="d-line">
        <span className="muted">Avans berilgan:</span>
        <strong>{formatUZS(sum.avansTotal)}</strong>
      </div>
      <div className="d-line">
        <span className="muted">Oylik berilgan:</span>
        <strong>{formatUZS(sum.salaryPayTotal)}</strong>
      </div>
      <div className="d-line">
        <span className="muted">Bonus (+):</span>
        <strong className="accent-pos">+{formatUZS(sum.bonusTotal)}</strong>
      </div>
      <div className="d-line">
        <span className="muted">Jarima (−):</span>
        <strong className="accent-neg">−{formatUZS(sum.penaltyTotal)}</strong>
      </div>
      <div className="d-line sep">
        <span>Oylik:</span>
        <span>{formatUZS(sum.netPayable)}</span>
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
            {emp.role} • {formatMonthUz(currM)} oyligi: {formatUZS(curr.netPayable)}
            {curr.avansRequested ? " • ✓ Avans so'ralgan" : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="rbtn primary-soft" onClick={onAvans}>
            + Avans
          </button>
          <button type="button" className="rbtn" onClick={onEdit}>
            Tahrirlash
          </button>
          <button type="button" className="m-close" aria-label="Yopish" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="d-body">
        <div className="d-compare">
          {card('Oldingi oy', prev, false)}
          {card('Hozirgi oy', curr, true)}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 13.5 }}>Barcha Operatsiyalar Jurnali (Izohi va Oyi bilan)</strong>
            <span className="tag num">{empTxs.length} ta yozuv</span>
          </div>
          <div className="tx-list">
            {empTxs.length === 0 ? (
              <div className="empty-box" style={{ padding: 22 }}>
                Hozircha operatsiyalar yo&apos;q.
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
                          {tx.shift ? 'Avans hisobi' : meta.label}
                        </span>
                        <span className="tag num">{formatMonthUz(tx.month)} hisobiga</span>
                        {tx.auto && <span className="tag">avtomatik</span>}
                      </div>
                      <div className="tx-reason">Izoh: {tx.reason}</div>
                      <div className="tx-date num">Sana: {tx.createdAt || '—'}</div>
                    </div>
                    <div className="tx-right num">
                      <strong className={colorCls} style={{ fontSize: 14 }}>
                        {prefix}
                        {formatUZS(tx.amount)}
                      </strong>
                      {tx.entryId && (
                        <button
                          type="button"
                          className="tx-del"
                          title="Ushbu yozuvni o'chirish"
                          disabled={busy === tx.entryId}
                          onClick={async () => {
                            setBusy(tx.entryId);
                            const res = await monitorDeleteEntryAction(tx.entryId!);
                            setBusy(null);
                            if ('error' in res) onError(res.error);
                            else onDeleted();
                          }}
                        >
                          O&apos;chirish
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
