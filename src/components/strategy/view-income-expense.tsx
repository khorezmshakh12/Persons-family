'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { addJournalEntryAction, deleteJournalEntryAction } from '@/lib/actions/accounting';
import { MONF } from '@/lib/strategy';
import { growth, moneyMonth, moneySeries, type MoneyItem, type MoneyLine } from '@/lib/strategy-money';
import { MonthPicker, type BooksLite } from './view-finance';
import { ask, toast } from './suite-shell';
import { formatUZS } from '@/lib/format-currency';

export type ExpenseCat = { k: string; n: string; acc: string };
export type CashBoxLite = { code: string; name: string };

const som = (v: number) => formatUZS(Math.round(v));
const mln = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',')} mln` : a >= 1e3 ? `${Math.round(a / 1e3)} ming` : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}${s}`;
};
const monthName = (ym: string) => `${MONF[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const short = (ym: string) => {
  const n = MONF[+ym.slice(5, 7) - 1];
  return n.startsWith('Iyu') ? n.slice(0, 4) : n.slice(0, 3);
};
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

function errText(code: string) {
  if (code === 'forbidden') return 'Xarajat yozishga ruxsat yo‘q — Hisob-kitob muharriri kerak';
  if (code === 'periodClosed' || code === 'period_closed') return 'Bu oy Hisob-kitobda yopilgan — avval oyni oching';
  if (code === 'invalidInput') return 'Summa, turkum va izohni tekshiring';
  if (code === 'notFound') return 'Yozuv topilmadi yoki avtomatik — sahifani yangilang';
  return 'Saqlab bo‘lmadi, qayta urinib ko‘ring';
}

export function IncomeExpenseView({
  books,
  today,
  cats,
  boxes,
  canBook,
}: {
  books: BooksLite;
  today: string;
  /** Kirim-chiqim expense categories (acct_cash_cats, dir 'out'). */
  cats: ExpenseCat[];
  boxes: CashBoxLite[];
  /** accounting.edit — may write an expense into the journal. */
  canBook: boolean;
}) {
  const currentYm = today.slice(0, 7);
  const [ym, setYm] = useState(currentYm);
  const [adding, setAdding] = useState(false);
  const { accounts, opening, entries } = books;
  const M = useMemo(() => moneyMonth(accounts, opening, entries, ym), [accounts, opening, entries, ym]);
  const P = useMemo(() => moneyMonth(accounts, opening, entries, prevYm(ym)), [accounts, opening, entries, ym]);
  const S = useMemo(() => moneySeries(accounts, opening, entries, ym, 12), [accounts, opening, entries, ym]);
  const top = Math.max(1, ...S.flatMap((x) => [x.income, x.expense]));
  const gIn = growth(M.income, P.income);
  const payroll = M.expenseBy.find((l) => l.key === 'payroll');

  return (
    <div className="s3">
      <div className="s3-bar">
        <MonthPicker value={ym} onChange={setYm} />
        <span className="s3-live">
          <i className={cn(ym === currentYm && 'on')} />
          {ym === currentYm ? 'Joriy oy · jonli' : monthName(ym)}
        </span>
        <span className="flex-1" />
        <Link href="/accounting" className="sx-btn sm">
          Hisob-kitobda ochish
        </Link>
        {canBook && (
          <button className="sx-btn primary sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {adding ? <X className="size-4" /> : <Plus className="size-4" />}
            {adding ? 'Yopish' : 'Xarajat qo‘shish'}
          </button>
        )}
      </div>

      {adding && canBook && <EntryForm ym={ym} today={today} cats={cats} boxes={boxes} onDone={() => setAdding(false)} />}

      {!M.booked && (
        <div className="s3-note">
          {monthName(ym)} uchun Hisob-kitobda hali yozuv yo‘q. Operatsiya HQ’da to‘lov kiritilishi bilan daromad shu yerda paydo bo‘ladi.
        </div>
      )}

      {M.booked && M.income > 0 && M.expense === 0 && (
        <div className="s3-note">
          {monthName(ym)} uchun xarajat (ish haqi, ijara…) hali yozilmagan — sof foyda va marja to‘liq emas. Ish haqi Moliya › Ish haqi’dan, boshqa xarajatlar «Xarajat qo‘shish» orqali tushadi.
        </div>
      )}

      <div className="s3-kpis">
        <Kpi l="Daromad" v={M.booked ? mln(M.income) : '—'} tone="pos" d={gIn === null ? 'o‘quvchi to‘lovlari · Operatsiya HQ' : `${gIn >= 0 ? '▲' : '▼'} ${Math.abs(gIn)}% o‘tgan oyga nisbatan`} />
        <Kpi l="Xarajat" v={M.booked ? mln(M.expense) : '—'} tone="neg" d={payroll && M.expense > 0 ? `ish haqi ${Math.round((payroll.amount / M.expense) * 100)}%` : 'Hisob-kitob · Kirim-chiqim'} />
        <Kpi l="Sof foyda" v={M.booked ? mln(M.net) : '—'} dark d={M.margin === null ? 'daromad yo‘q — marja hisoblanmaydi' : M.expense === 0 ? 'xarajat yozilmagan — marja to‘liq emas' : `marja ${String(M.margin).replace('.', ',')}%`} />
        <Kpi l="Pul qoldig‘i" v={mln(M.cash)} tone={M.cash < 0 ? 'neg' : undefined} d={M.cash < 0 ? 'manfiy — kirimlar to‘liq yozilmagan bo‘lishi mumkin' : `${monthName(ym)} oxiriga`} />
      </div>

      <section className="sx-card s3-card">
        <div className="s3-ch">
          <h3>12 oy · daromad va xarajat</h3>
          <div className="s3-leg">
            <span><i className="in" />Daromad</span>
            <span><i className="out" />Xarajat</span>
          </div>
        </div>
        <div className="s3-bars" role="img" aria-label="So‘nggi 12 oy daromad va xarajat">
          {S.map((x) => (
            <button key={x.ym} className={cn('s3-b', x.ym === ym && 'on')} onClick={() => setYm(x.ym)} title={`${monthName(x.ym)}: daromad ${som(x.income)} · xarajat ${som(x.expense)}`}>
              <span className="pr">
                <i className="in" style={{ height: `${(Math.max(0, x.income) / top) * 100}%` }} />
                <i className="out" style={{ height: `${(Math.max(0, x.expense) / top) * 100}%` }} />
              </span>
              <em>{short(x.ym)}</em>
            </button>
          ))}
        </div>
      </section>

      <div className="s3-two">
        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>Daromadlar</h3>
            <span className="s3-src">Operatsiya HQ’dan avtomatik</span>
          </div>
          <Lines lines={M.incomeBy} total={M.income + M.refunds} tone="in" empty="Bu oy to‘lov yo‘q" />
          {M.refunds > 0 && (
            <div className="s3-line">
              <span>Qaytarilgan</span>
              <b className="neg tabular-nums">−{som(M.refunds)}</b>
            </div>
          )}
          <Recent title="To‘lovlar" items={M.lastIn} canBook={canBook} cats={cats} boxes={boxes} />
        </section>

        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>Xarajatlar</h3>
            <span className="s3-src">Hisob-kitob · ish haqi avtomatik</span>
          </div>
          <Lines lines={M.expenseBy} total={M.expense} tone="out" empty="Bu oy xarajat yozilmagan" />
          <Recent title="Xarajatlar ro‘yxati" items={M.lastOut} negative canBook={canBook} cats={cats} boxes={boxes} />
        </section>
      </div>
    </div>
  );
}

function prevYm(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + m - 2;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function Kpi({ l, v, d, tone, dark }: { l: string; v: string; d: string; tone?: 'pos' | 'neg'; dark?: boolean }) {
  return (
    <div className={cn('sx-card s3-kpi', dark && 'dark')}>
      <div className="l">{l}</div>
      <div className={cn('v tabular-nums', tone)}>{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}

function Lines({ lines, total, tone, empty }: { lines: MoneyLine[]; total: number; tone: 'in' | 'out'; empty: string }) {
  if (!lines.length) return <div className="s3-empty">{empty}</div>;
  return (
    <div>
      {lines.map((l) => (
        <div key={l.key} className="s3-line">
          <span>
            {l.name}
            {l.key === 'payroll' && <small className="s3-tag">avto</small>}
          </span>
          <b className="tabular-nums">{som(l.amount)}</b>
          <span className="s3-pb">
            <i className={tone} style={{ width: `${total > 0 ? Math.max(2, (l.amount / total) * 100) : 0}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Recent({
  title,
  items,
  negative,
  canBook,
  cats,
  boxes,
}: {
  title: string;
  items: MoneyItem[];
  negative?: boolean;
  canBook: boolean;
  cats: ExpenseCat[];
  boxes: CashBoxLite[];
}) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 6);

  const remove = (x: MoneyItem) =>
    start(async () => {
      if (!(await ask(`«${x.text}» (${som(Math.abs(x.amount))} so‘m) o‘chirilsinmi? Hisob-kitob jurnalidan ham o‘chadi.`))) return;
      const res = await deleteJournalEntryAction(x.id);
      if (res.error) return void toast.error(errText(res.error));
      toast.success('Yozuv o‘chirildi');
      router.refresh();
    });

  return (
    <div className="s3-recent">
      <div className="s3-k">
        {title} · {items.length}
      </div>
      {shown.map((x) =>
        editing === x.id ? (
          <EntryForm key={x.id} entry={x} today={x.date} ym={x.date.slice(0, 7)} cats={cats} boxes={boxes} onDone={() => setEditing(null)} />
        ) : (
          <div key={x.id} className="s3-li">
            <span className="dt tabular-nums">{ddmm(x.date)}</span>
            <span className="tx">
              {x.text}
              {x.fromOps && (
                <Link href="/operations" className="s3-tag" title="Operatsiya HQ’dagi to‘lov — o‘sha yerda tahrirlanadi yoki bekor qilinadi">
                  Operatsiya HQ
                </Link>
              )}
              {!x.manual && !x.fromOps && <small className="s3-tag" title="Avtomatik yozuv — o‘z bo‘limida o‘zgaradi">avto</small>}
            </span>
            <b className={cn('tabular-nums', negative || x.amount < 0 ? 'neg' : 'pos')}>
              {negative || x.amount < 0 ? '−' : '+'}
              {som(Math.abs(x.amount))}
            </b>
            {canBook && x.manual && (
              <span className="s3-act">
                <button aria-label="Tahrirlash" title="Tahrirlash" disabled={pending} onClick={() => setEditing(x.id)}>
                  <Pencil className="size-3.5" />
                </button>
                <button aria-label="O‘chirish" title="O‘chirish" disabled={pending} onClick={() => remove(x)}>
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            )}
          </div>
        ),
      )}
      {items.length > 6 && (
        <button className="s3-link mt-1" onClick={() => setAll((v) => !v)}>
          {all ? 'Qisqartirish' : `Hammasini ko‘rsatish (${items.length})`}
        </button>
      )}
    </div>
  );
}

/** New expense (entry undefined) or an edit of one hand-typed journal row.
 * An expense row keeps category / cash box pickers; any other hand-typed row
 * (e.g. a manual income) keeps its accounts and edits date, sum and text. */
function EntryForm({
  entry,
  ym,
  today,
  cats,
  boxes,
  onDone,
}: {
  entry?: MoneyItem;
  ym: string;
  today: string;
  cats: ExpenseCat[];
  boxes: CashBoxLite[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fitted = !entry || (cats.some((c) => c.acc === entry.debit) && boxes.some((b) => b.code === entry.credit));
  // Default date: today in the current month, else the month's 1st.
  const [date, setDate] = useState(entry?.date ?? (today.startsWith(ym) ? today : `${ym}-01`));
  const [cat, setCat] = useState((entry && cats.find((c) => c.acc === entry.debit)?.k) ?? cats[0]?.k ?? '');
  const [box, setBox] = useState(entry?.credit && boxes.some((b) => b.code === entry.credit) ? entry.credit : (boxes[0]?.code ?? ''));
  const [amount, setAmount] = useState(entry ? String(Math.abs(entry.amount)) : '');
  const [note, setNote] = useState(entry?.text ?? '');
  const sum = Number(amount.replace(/\D/g, '')) || 0;
  const c = cats.find((x) => x.k === cat);
  const ready = (fitted ? !!c && !!box : true) && sum > 0 && note.trim().length >= 2;

  if (!entry && (!cats.length || !boxes.length))
    return <div className="s3-note">Xarajat turkumlari yoki kassa sozlanmagan. Ularni Hisob-kitob › Kirim-chiqim’da qo‘shing.</div>;

  const save = () =>
    start(async () => {
      const debit = fitted ? c!.acc : entry!.debit;
      const credit = fitted ? box : entry!.credit;
      const description = (entry ? note.trim() : `${c!.n} — ${note.trim()}`).slice(0, 300);
      const res = await addJournalEntryAction({ id: entry?.id, date, doc: '', description, debit, credit, amount: sum });
      if (res.error) return void toast.error(errText(res.error));
      toast.success(entry ? 'Yozuv saqlandi' : `Xarajat yozildi: ${som(sum)} so‘m`);
      onDone();
      router.refresh();
    });

  return (
    <form
      className={cn('sx-card s3-form', entry && 'inline')}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !pending) save();
      }}
    >
      <label>
        <span>Sana</span>
        <input id={`s3-date-${entry?.id ?? 'new'}`} className="sx-inp" type="date" value={date} max={today > date ? today : date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {fitted && (
        <>
          <label>
            <span>Turkum</span>
            <select id={`s3-cat-${entry?.id ?? 'new'}`} className="sx-inp" value={cat} onChange={(e) => setCat(e.target.value)}>
              {cats.map((x) => (
                <option key={x.k} value={x.k}>
                  {x.n}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Qayerdan</span>
            <select id={`s3-box-${entry?.id ?? 'new'}`} className="sx-inp" value={box} onChange={(e) => setBox(e.target.value)}>
              {boxes.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        <span>Summa, so‘m</span>
        <input id={`s3-sum-${entry?.id ?? 'new'}`} className="sx-inp tabular-nums" inputMode="numeric" value={amount ? som(sum) : ''} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </label>
      <label className="wide">
        <span>Izoh</span>
        <input id={`s3-note-${entry?.id ?? 'new'}`} className="sx-inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: Instagram reklama, noyabr" maxLength={entry ? 300 : 200} />
      </label>
      <span className="flex gap-2">
        <button className="sx-btn primary" type="submit" disabled={!ready || pending}>
          {pending ? 'Saqlanmoqda…' : entry ? 'Saqlash' : 'Xarajatni yozish'}
        </button>
        {entry && (
          <button className="sx-btn" type="button" onClick={onDone}>
            Bekor
          </button>
        )}
      </span>
    </form>
  );
}
