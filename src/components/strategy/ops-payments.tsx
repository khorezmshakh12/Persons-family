'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { addDaysToKey } from '@/lib/time';
import { shiftMonthKey, monthEnd } from '@/lib/ops-health';
import { cancelPaymentAction, listPaymentsAction, updatePaymentAction, type PaymentRow } from '@/lib/actions/students';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { METHODS, PAY_METHODS, dmy, errText, som, when } from './ops-students-meta';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const digits = (v: string) => v.replace(/\D/g, '');

/** Operation HQ › To'lovlar: every student payment of a period — filter, totals by method, correct or cancel. */
export function OpsPayments({ data }: { data: OpsData }) {
  const router = useRouter();
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
  const net = (r: PaymentRow) => (r.refund ? -r.amount : r.amount);
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
          <h3>To‘lovlar</h3>
          <small>har bir kiritilgan to‘lov · tahrirlash va bekor qilish tarixda qoladi</small>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="sx-inp !w-auto" aria-label="Davr" value={span} onChange={(e) => setSpan(e.target.value)}>
            <option value="7d">Oxirgi 7 kun</option>
            {Array.from({ length: 12 }, (_, i) => shiftMonthKey(cur, -i)).map((m) => (
              <option key={m} value={m}>
                {MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
              </option>
            ))}
          </select>
          <select className="sx-inp !w-auto" aria-label="To‘lov usuli" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Barcha usullar</option>
            {Object.entries(METHODS).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          <select className="sx-inp !w-auto" aria-label="Kim qabul qildi" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Hamma qabul qilganlar</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input className="sx-inp !w-auto min-w-[180px] flex-1" placeholder="O‘quvchi ismi…" aria-label="Qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
            <input type="checkbox" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} /> Faqat tahrirlangan / bekor qilingan
          </label>
        </div>
      </div>

      <div className="sx-card sx-stat dark s3">
        <div className="l">Jami (sof)</div>
        <div className="v">{som(total)}</div>
        <div className="d">{list.filter((r) => !r.refund).length} ta to‘lov</div>
      </div>
      {[...byMethod]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m, v]) => (
          <div key={m} className="sx-card sx-stat s3">
            <div className="l">{METHODS[m] ?? m}</div>
            <div className="v">{som(v)}</div>
            <div className="d">{total ? Math.round((v / total) * 100) : 0}% ulush</div>
          </div>
        ))}
      <div className="sx-card sx-stat s3">
        <div className="l">Tahrirlangan / bekor qilingan</div>
        <div className="v">{edited}</div>
        <div className="d">kim, nimani o‘zgartirgani yozilgan</div>
      </div>

      <div className="sx-card s12 overflow-x-auto">
        {!rows ? (
          <div className="sx-empty">{failed ? 'To‘lovlarni yuklab bo‘lmadi' : 'Yuklanmoqda…'}</div>
        ) : list.length === 0 ? (
          <div className="sx-empty">Bu filtrda to‘lov yo‘q</div>
        ) : (
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-au-faint">
                <th className="px-2 py-2 font-bold">Sana</th>
                <th className="px-2 py-2 font-bold">O‘quvchi</th>
                <th className="px-2 py-2 text-right font-bold">Summa</th>
                <th className="px-2 py-2 font-bold">Usul</th>
                <th className="px-2 py-2 font-bold">Qabul qildi</th>
                <th className="px-2 py-2 font-bold">Izoh</th>
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
          {r.isCancel ? 'Bekor qilish yozuvi' : r.refund ? 'Qaytarildi' : ''}
          {r.note && <div className="no-underline">{r.note}</div>}
          {r.cancelled && <div className="font-semibold text-au-bad">Bekor qilingan</div>}
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
              Tahrirlash
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
      onDone('To‘lov tahrirlandi');
    });
  const cancel = () =>
    start(async () => {
      const r = await cancelPaymentAction({ paymentId: payment.id, reason });
      if (r.error) return onFail(r.error);
      onDone(`${som(payment.amount)} to‘lov bekor qilindi`);
    });
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-au-accent/50 bg-au-accent-soft/60 p-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          To‘lov usuli
          <select id={`pe-m-${payment.id}`} className="sx-inp" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHODS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          Summa
          <input id={`pe-a-${payment.id}`} className="sx-inp" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value) ? formatUZS(Number(digits(e.target.value))) : '')} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          Sana
          <input id={`pe-d-${payment.id}`} type="date" className="sx-inp" max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
          Sabab (majburiy)
          <input id={`pe-r-${payment.id}`} className="sx-inp" maxLength={300} placeholder="Masalan: aslida Click orqali to‘langan" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-au-faint">
        Summa o‘zgarsa balans farq bo‘yicha to‘g‘rilanadi. Bekor qilish hech narsani o‘chirmaydi: summa bugungi sana bilan qaytariladi, asl yozuv «bekor qilingan» bo‘lib qoladi.
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="sx-btn primary" disabled={pending || !ok || !digits(amount) || !paidAt} onClick={save}>
          Saqlash
        </button>
        {sure ? (
          <button className="sx-btn text-au-bad" disabled={pending || !ok} onClick={cancel}>
            Ha, {som(payment.amount)} ni bekor qilish
          </button>
        ) : (
          <button className="sx-btn text-au-bad" disabled={pending || !ok} onClick={() => setSure(true)}>
            To‘lovni bekor qilish
          </button>
        )}
        <button className="sx-btn" onClick={onCancel}>
          Yopish
        </button>
      </div>
    </div>
  );
}
