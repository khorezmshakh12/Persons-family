'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { MoneyInput } from '@/components/ui/money-input';
import { addDaysToKey } from '@/lib/time';
import { shiftMonthKey, monthEnd } from '@/lib/ops-health';
import { cancelPaymentAction, listPaymentsAction, updatePaymentAction, type PaymentRow } from '@/lib/actions/students';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { useLocale, useTranslations } from 'next-intl';
import { PAY_METHODS, dmy, som, useOpsMeta, when } from './ops-students-meta';

/** «Noyabr 2026» / «November 2026» for a 'YYYY-MM-01' key. */
export const monthLabel = (locale: string, m: string) =>
  new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn' : locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}T00:00:00Z`));
const digits = (v: string) => v.replace(/\D/g, '');

/** Operation HQ › To'lovlar: every student payment of a period — filter, totals by method, correct or cancel. */
export function OpsPayments({ data }: { data: OpsData }) {
  const router = useRouter();
  const t = useTranslations('ops');
  const locale = useLocale();
  const { METHODS, errText } = useOpsMeta();
  const today = data.today.day;
  const cur = `${today.slice(0, 7)}-01`;
  const [span, setSpan] = useState(cur);
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [method, setMethod] = useState('');
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const range = span === '7d' ? { from: addDaysToKey(today, -6), to: today } : { from: span, to: monthEnd(span) < today ? monthEnd(span) : today };
  // Reloads when the period changes or after a correction (tick).
  useEffect(() => {
    let live = true;
    setFailed(false);
    listPaymentsAction(range).then((r) => {
      if (!live) return;
      if (r.rows) setRows(r.rows);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span, tick]);

  const actors = useMemo(() => [...new Set((rows ?? []).map((r) => r.actor))].sort(), [rows]);
  const list = (rows ?? []).filter(
    (r) =>
      (!method || r.method === method) &&
      (!actor || r.actor === actor) &&
      (!onlyEdited || r.edit || r.cancelled || r.isCancel) &&
      (!q || r.student.toLowerCase().includes(q.toLowerCase())),
  );
  // A cancelled payment and the row that cancels it are a mistake undone:
  // neither is money in or out, so both stay out of the totals.
  const net = (r: PaymentRow) => (r.cancelled || r.isCancel ? 0 : r.refund ? -r.amount : r.amount);
  const total = list.reduce((a, r) => a + net(r), 0);
  const byMethod = new Map<string, number>();
  for (const r of list) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + net(r));
  const edited = (rows ?? []).filter((r) => r.edit || r.cancelled).length;

  const done = (msg: string) => {
    playSound('ok');
    toast.success(msg);
    setEditing(null);
    setTick((t) => t + 1);
    router.refresh();
  };
  const fail = (e: string) => {
    playSound('err');
    toast.error(errText(e));
  };

  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h flex-wrap">
          <h3>{t('pay.title')}</h3>
          <small>{t('pay.subtitle')}</small>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="sx-inp !w-auto" aria-label={t('c.period')} value={span} onChange={(e) => setSpan(e.target.value)}>
            <option value="7d">{t('c.last7')}</option>
            {Array.from({ length: 12 }, (_, i) => shiftMonthKey(cur, -i)).map((m) => (
              <option key={m} value={m}>
                {monthLabel(locale, m)}
              </option>
            ))}
          </select>
          <select className="sx-inp !w-auto" aria-label={t('c.payMethod')} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">{t('pay.allMethods')}</option>
            {Object.entries(METHODS).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          <select className="sx-inp !w-auto" aria-label={t('pay.receivedBy')} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">{t('pay.allReceivers')}</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input className="sx-inp !w-auto min-w-[180px] flex-1" placeholder={t('pay.studentName')} aria-label={t('c.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
            <input type="checkbox" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} /> {t('pay.onlyEdited')}
          </label>
        </div>
      </div>

      <div className="sx-card sx-stat dark s3">
        <div className="l">{t('pay.net')}</div>
        <div className="v">{som(total)}</div>
        <div className="d">{t('pay.nPayments', { n: list.filter((r) => !r.refund && !r.cancelled).length })}</div>
      </div>
      {[...byMethod]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m, v]) => (
          <div key={m} className="sx-card sx-stat s3">
            <div className="l">{METHODS[m] ?? m}</div>
            <div className="v">{som(v)}</div>
            <div className="d">{t('c.share', { n: total ? Math.round((v / total) * 100) : 0 })}</div>
          </div>
        ))}
      <div className="sx-card sx-stat s3">
        <div className="l">{t('pay.edited')}</div>
        <div className="v">{edited}</div>
        <div className="d">{t('pay.editedHint')}</div>
      </div>

      <div className="sx-card s12 overflow-x-auto">
        {!rows ? (
          <div className="sx-empty">{failed ? t('pay.loadFailed') : t('c.loading')}</div>
        ) : list.length === 0 ? (
          <div className="sx-empty">{t('pay.empty')}</div>
        ) : (
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-au-faint">
                <th className="px-2 py-2 font-bold">{t('c.date')}</th>
                <th className="px-2 py-2 font-bold">{t('c.student')}</th>
                <th className="px-2 py-2 text-right font-bold">{t('c.amount')}</th>
                <th className="px-2 py-2 font-bold">{t('c.method')}</th>
                <th className="px-2 py-2 font-bold">{t('pay.received')}</th>
                <th className="px-2 py-2 font-bold">{t('c.note')}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <PayRow key={r.id} r={r} today={today} canEdit={data.canEdit} open={editing === r.id} onOpen={() => setEditing(editing === r.id ? null : r.id)} onDone={done} onFail={fail} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PayRow({ r, today, canEdit, open, onOpen, onDone, onFail }: { r: PaymentRow; today: string; canEdit: boolean; open: boolean; onOpen: () => void; onDone: (m: string) => void; onFail: (e: string) => void }) {
  const locked = r.refund || r.cancelled;
  const t = useTranslations('ops');
  const { METHODS } = useOpsMeta();
  return (
    <>
      <tr className={cn('border-t border-au-line align-top', (r.edit || r.cancelled) && 'bg-au-info-soft/50', r.cancelled && 'text-au-faint line-through')}>
        <td className="px-2 py-2 tabular-nums">{dmy(r.date)}</td>
        <td className="px-2 py-2 text-au-ink">{r.student}</td>
        <td className={cn('px-2 py-2 text-right font-bold tabular-nums', r.refund ? 'text-au-bad' : 'text-au-ok')}>
          {r.refund ? '−' : '+'}
          {formatUZS(r.amount)}
        </td>
        <td className="px-2 py-2">
          <span className={cn('sx-pl', r.method === 'cash' ? 'mute' : 'info')}>{METHODS[r.method] ?? r.method}</span>
        </td>
        <td className="px-2 py-2 text-au-muted">{r.actor}</td>
        <td className="max-w-[280px] px-2 py-2 text-xs text-au-muted">
          {r.isCancel ? t('pay.cancelRow') : r.refund ? t('pay.refunded') : ''}
          {r.note && <div className="no-underline">{r.note}</div>}
          {r.cancelled && <div className="font-semibold text-au-bad">{t('pay.cancelled')}</div>}
          {r.edit && (
            <div className="text-au-info">
              ✎ {r.edit}
              {r.editedBy ? ` · ${r.editedBy}` : ''}
              {r.editedAt ? ` · ${when(r.editedAt)}` : ''}
            </div>
          )}
        </td>
        <td className="px-2 py-2 text-right">
          {canEdit && !locked && (
            <button className={cn('sx-btn sm', open && 'border-au-accent')} onClick={onOpen}>
              {t('c.edit')}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-2 pb-3">
            <PaymentEditor payment={r} today={today} onDone={onDone} onFail={onFail} onCancel={onOpen} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Correct a payment (method, amount, date) or cancel it; a reason is required for both. Shared with the student card. */
export function PaymentEditor({
  payment,
  today,
  onDone,
  onFail,
  onCancel,
}: {
  payment: { id: string; amount: number; method: string; date: string };
  today: string;
  onDone: (m: string) => void;
  onFail: (e: string) => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const t = useTranslations('ops');
  const { METHODS } = useOpsMeta();
  const [method, setMethod] = useState(payment.method);
  const [amount, setAmount] = useState(formatUZS(payment.amount));
  const [paidAt, setPaidAt] = useState(payment.date);
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const ok = reason.trim().length >= 3;
  const save = () =>
    start(async () => {
      const r = await updatePaymentAction({ paymentId: payment.id, method: method as (typeof PAY_METHODS)[number], amount: Number(digits(amount)), paidAt, reason });
      if (r.error) return onFail(r.error);
      onDone(t('pay.editedToast'));
    });
  const cancel = () =>
    start(async () => {
      const r = await cancelPaymentAction({ paymentId: payment.id, reason });
      if (r.error) return onFail(r.error);
      onDone(t('pay.cancelledToast', { sum: som(payment.amount) }));
    });
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-au-accent/50 bg-au-accent-soft/60 p-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          {t('c.payMethod')}
          <select id={`pe-m-${payment.id}`} className="sx-inp" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHODS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          {t('c.amount')}
          <MoneyInput id={`pe-a-${payment.id}`} className="sx-inp" value={digits(amount) ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : formatUZS(v))} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          {t('c.date')}
          <input id={`pe-d-${payment.id}`} type="date" className="sx-inp" max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          {t('c.reasonRequired')}
          <input id={`pe-r-${payment.id}`} className="sx-inp" maxLength={300} placeholder={t('pay.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-au-faint">
        {t('pay.editHint')}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="sx-btn primary" disabled={pending || !ok || !digits(amount) || !paidAt} onClick={save}>
          {t('c.save')}
        </button>
        {sure ? (
          <button className="sx-btn text-au-bad" disabled={pending || !ok} onClick={cancel}>
            {t('pay.confirmCancel', { sum: som(payment.amount) })}
          </button>
        ) : (
          <button className="sx-btn text-au-bad" disabled={pending || !ok} onClick={() => setSure(true)}>
            {t('pay.cancelPayment')}
          </button>
        )}
        <button className="sx-btn" onClick={onCancel}>
          {t('c.close')}
        </button>
      </div>
    </div>
  );
}
