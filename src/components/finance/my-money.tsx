'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Receipt, Undo2, Wallet } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import { cancelReimbursementAction, confirmPaymentAction, requestReimbursementAction } from '@/lib/actions/pay-run';
import { monthLabel } from '@/lib/pay-run';
import type { MyPayment, Reimbursement } from '@/lib/pay-run-data';

/* Mening moliyam v2 (owner, 2026-10-21): the staff side of a payment —
 * "Oldim" closes the loop on every payout, and money spent for the centre
 * is asked back here instead of in a chat. */

const som = (n: number) => formatUZS(Math.round(n));
const digits = (v: string) => v.replace(/[^\d]/g, '');
const BTN = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-50';

const ERR: Record<string, string> = {
  reasonRequired: 'Muammoni qisqacha yozing',
  alreadyDecided: 'So‘rov allaqachon ko‘rib chiqilgan',
  invalidInput: 'Ma’lumotni tekshiring',
  notFound: 'To‘lov topilmadi — sahifani yangilang',
};
const errText = (c: string) => ERR[c] ?? 'Saqlab bo‘lmadi, qayta urinib ko‘ring';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' });

/** The latest payouts, each with "Oldim" / "Muammo bor". */
export function MyPaymentsPanel({ payments }: { payments: MyPayment[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [disputing, setDisputing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const waiting = payments.filter((p) => !p.receipt).length;

  const answer = (id: string, status: 'received' | 'disputed', text = '') =>
    start(async () => {
      const res = await confirmPaymentAction({ entryId: id, status, note: text });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(status === 'received' ? 'Rahmat — qabul qilinganingiz belgilandi' : 'Xabar CEO’ga yuborildi');
      setDisputing(null);
      setNote('');
      router.refresh();
    });

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4')}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-au-ink">
        <Wallet className="size-4 text-au-ok" /> To‘lovlarim
        {waiting > 0 && <span className={CHIP_INFO}>{waiting} ta tasdiqlanmagan</span>}
      </h3>
      {payments.length === 0 ? (
        <p className="text-xs text-au-muted">Hali to‘lov yo‘q.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-2xl bg-au-card-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-au-ink">{p.title}</div>
                  <div className="text-[11px] text-au-muted">
                    {dayFmt.format(new Date(p.at))}
                    {p.period && ` · ${monthLabel(p.period)}`}
                    {p.method && ` · ${p.method}`}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold text-au-ink tabular-nums">{som(p.amount)}</span>
              </div>
              {p.receipt === 'received' ? (
                <span className={cn(CHIP_OK, 'w-fit')}>
                  <CheckCircle2 className="size-3.5" /> Oldim
                </span>
              ) : p.receipt === 'disputed' && disputing !== p.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(CHIP_BAD, 'w-fit')}>
                    <AlertTriangle className="size-3.5" /> Muammo: {p.receiptNote}
                  </span>
                  <button className={cn(BTN, 'border border-au-line text-au-ink')} disabled={busy} onClick={() => answer(p.id, 'received')}>
                    Hal bo‘ldi — oldim
                  </button>
                </div>
              ) : disputing === p.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nima noto‘g‘ri? (masalan: kam berildi)"
                    className={cn(INPUT, 'h-9 flex-1 text-xs')}
                  />
                  <button className={cn(BTN, 'bg-au-bad text-white')} disabled={busy || note.trim().length < 3} onClick={() => answer(p.id, 'disputed', note.trim())}>
                    Yuborish
                  </button>
                  <button className={cn(BTN, 'text-au-muted')} onClick={() => setDisputing(null)}>
                    Bekor
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className={cn(BTN, 'bg-au-ok text-white')} disabled={busy} onClick={() => answer(p.id, 'received')}>
                    <CheckCircle2 className="size-3.5" /> Oldim
                  </button>
                  <button className={cn(BTN, 'border border-au-line text-au-ink')} disabled={busy} onClick={() => setDisputing(p.id)}>
                    Muammo bor
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STATUS: Record<Reimbursement['status'], { n: string; cls: string }> = {
  pending: { n: 'Ko‘rib chiqilmoqda', cls: CHIP_INFO },
  approved: { n: 'Tasdiqlandi', cls: CHIP_OK },
  rejected: { n: 'Rad etildi', cls: CHIP_BAD },
  cancelled: { n: 'Bekor qilindi', cls: CHIP_NEUTRAL },
};

/** Ask back money spent for the centre; it is paid with a month's salary. */
export function ReimbursePanel({ items }: { items: Reimbursement[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const num = Number(digits(amount));

  const submit = () =>
    start(async () => {
      const res = await requestReimbursementAction({ amount: num, title: title.trim(), note: note.trim(), spentOn });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setOpen(false);
      setAmount('');
      setTitle('');
      setNote('');
      setSpentOn('');
      toast.success('So‘rov yuborildi — CEO’ga xabar ketdi');
      router.refresh();
    });

  const cancel = (id: string) =>
    start(async () => {
      const res = await cancelReimbursementAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success('So‘rov qaytarib olindi');
      router.refresh();
    });

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4')}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-au-ink">
        <Receipt className="size-4 text-au-info" /> Xarajatni qoplash
      </h3>
      <p className="text-xs text-au-muted">Markaz uchun o‘z pulingizdan to‘lagan bo‘lsangiz (taksi, material, xarid) — shu yerdan so‘rang. Tasdiqlansa, oyligingizga qo‘shiladi.</p>
      {open ? (
        <div className="flex flex-col gap-2">
          <input value={amount} onChange={(e) => setAmount(digits(e.target.value))} inputMode="numeric" placeholder="Summa, so‘m" className={cn(INPUT, 'tabular-nums')} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nima uchun (masalan: printer qog‘ozi)" className={INPUT} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh (ixtiyoriy)" className={INPUT} />
          <label className="flex items-center gap-2 text-xs text-au-muted">
            Sana
            <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={cn(INPUT, 'h-9 flex-1')} />
          </label>
          <div className="flex justify-end gap-2">
            <button className={cn(BTN, 'text-au-muted')} onClick={() => setOpen(false)}>
              Bekor
            </button>
            <button className={cn(BTN, 'bg-au-primary text-au-primary-ink')} disabled={busy || !num || title.trim().length < 3} onClick={submit}>
              Yuborish
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="h-9 rounded-au-ctl border border-au-line text-sm font-semibold hover:bg-au-card-2">
          Qoplashni so‘rash
        </button>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-xs">
          {items.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-au-ink">
                {r.title} · <b className="tabular-nums">{som(r.amount)}</b>
                {r.status === 'approved' && r.period && <span className="text-au-muted"> · {monthLabel(r.period)} oyligi bilan</span>}
                {r.status === 'rejected' && r.decision_note && <span className="text-au-muted"> · {r.decision_note}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={STATUS[r.status].cls}>{STATUS[r.status].n}</span>
                {r.status === 'pending' && (
                  <button disabled={busy} onClick={() => cancel(r.id)} className="text-au-muted hover:text-au-ink" aria-label="Qaytarib olish">
                    <Undo2 className="size-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
