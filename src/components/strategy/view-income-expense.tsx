'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { addJournalEntryAction, deleteJournalEntryAction } from '@/lib/actions/accounting';
import { MONF } from '@/lib/strategy';
import { growth, moneyMonth, moneySeries, REVENUE, type MoneyItem, type MoneyLine } from '@/lib/strategy-money';
import { MonthPicker, type BooksLite } from './view-finance';
import { ask, toast } from './suite-shell';
import { formatUZS } from '@/lib/format-currency';
import {
  addMonthsYm,
  backtest,
  CYCLES,
  CYCLE_NAME,
  expenseRows,
  forecastMonth,
  forecastType,
  KIND_NAME,
  nextDay,
  type Cycle,
  type ForecastKind,
  type TypeForecast,
} from '@/lib/expense-forecast';
import { setCashCatCycleAction } from '@/lib/actions/accounting';

export type ExpenseCat = { k: string; n: string; acc: string; active: boolean; cycle: Cycle };
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
  /** Expense types (acct_cash_cats, dir 'out'), hidden ones included. */
  cats: ExpenseCat[];
  boxes: CashBoxLite[];
  /** accounting.edit — may write an expense into the journal. */
  canBook: boolean;
}) {
  const currentYm = today.slice(0, 7);
  const [ym, setYm] = useState(currentYm);
  const [adding, setAdding] = useState(false);
  const { accounts, opening, entries } = books;
  const catNames = useMemo(() => Object.fromEntries(cats.map((c) => [c.k, c.n])), [cats]);
  const M = useMemo(() => moneyMonth(accounts, opening, entries, ym, catNames), [accounts, opening, entries, ym, catNames]);
  const P = useMemo(() => moneyMonth(accounts, opening, entries, prevYm(ym), catNames), [accounts, opening, entries, ym, catNames]);
  const formCats = useMemo(() => cats.filter((c) => c.active), [cats]);
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

      {adding && canBook && <EntryForm ym={ym} today={today} cats={formCats} allCats={cats} books={books} boxes={boxes} onDone={() => setAdding(false)} />}

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
          <Recent title="To‘lovlar" items={M.lastIn} canBook={canBook} cats={cats} boxes={boxes} books={books} />
        </section>

        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>Xarajatlar</h3>
            <span className="s3-src">Hisob-kitob · ish haqi avtomatik</span>
          </div>
          <Lines lines={M.expenseBy} total={M.expense} tone="out" empty="Bu oy xarajat yozilmagan" />
          <Recent title="Xarajatlar ro‘yxati" items={M.lastOut} negative canBook={canBook} cats={cats} boxes={boxes} books={books} />
        </section>
      </div>

      <Forecast books={books} cats={cats} ym={ym} today={today} canBook={canBook} />
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
  books,
}: {
  title: string;
  items: MoneyItem[];
  negative?: boolean;
  canBook: boolean;
  cats: ExpenseCat[];
  boxes: CashBoxLite[];
  books: BooksLite;
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
          <EntryForm key={x.id} entry={x} today={x.date} ym={x.date.slice(0, 7)} cats={cats.filter((c) => c.active || c.k === x.cat)} allCats={cats} books={books} boxes={boxes} onDone={() => setEditing(null)} />
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

/** Plain recurrence line for one type, from the same forecast the table shows. */
function cycleHint(t: TypeForecast, name: string, target: string): string {
  if (!t.payments) return `${name}: hali yozuv yo‘q — birinchi xarajatdan keyin takrorlanishi hisoblana boshlaydi.`;
  const every = t.gapDays ? `odatda har ~${t.gapDays} kunda` : 'takrorlanishi hali noma’lum';
  return `${name}: 180 kunda ${t.payments} marta, ${every}, bitta to‘lov ~${som(t.perPayment)} so‘m. ${monthName(target)} prognozi: ${som(t.amount)} so‘m (${KIND_NAME[t.kind].toLowerCase()}).`;
}

/** New expense (entry undefined) or an edit of one hand-typed journal row.
 * A new expense must name its type — statistics and the forecast group by it.
 * An expense row keeps type / cash box pickers; any other hand-typed row
 * (e.g. a manual income) keeps its accounts and edits date, sum and text. */
function EntryForm({
  entry,
  ym,
  today,
  cats,
  allCats,
  books,
  boxes,
  onDone,
}: {
  entry?: MoneyItem;
  ym: string;
  today: string;
  /** Types offered in the picker (active ones, plus the row's own). */
  cats: ExpenseCat[];
  allCats: ExpenseCat[];
  books: BooksLite;
  boxes: CashBoxLite[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const own = entry?.cat ? allCats.find((c) => c.k === entry.cat) : undefined;
  const fitted = !entry || ((!!own || cats.some((c) => c.acc === entry.debit)) && boxes.some((b) => b.code === entry.credit));
  // Default date: today in the current month, else the month's 1st.
  const [date, setDate] = useState(entry?.date ?? (today.startsWith(ym) ? today : `${ym}-01`));
  const [cat, setCat] = useState(entry ? (own?.k ?? cats.find((c) => c.acc === entry.debit)?.k ?? '') : '');
  const [box, setBox] = useState(entry?.credit && boxes.some((b) => b.code === entry.credit) ? entry.credit : (boxes[0]?.code ?? ''));
  const [amount, setAmount] = useState(entry ? String(Math.abs(entry.amount)) : '');
  const [note, setNote] = useState(entry?.text ?? '');
  const sum = Number(amount.replace(/\D/g, '')) || 0;
  const c = allCats.find((x) => x.k === cat);
  const ready = (fitted ? !!c && !!box : true) && sum > 0 && note.trim().length >= 2;
  const target = addMonthsYm(today.slice(0, 7), 1);
  const hint = useMemo(() => {
    if (!c) return null;
    if (c.acc === REVENUE) return `${c.n}: xarajat emas — daromaddan ayriladi (Operatsiya HQ qaytarishlari kabi).`;
    const t = forecastType(c.k, expenseRows(books.accounts, books.entries), nextDay(today), target, c.cycle);
    return cycleHint(t, c.n, target);
  }, [c, books, today, target]);

  if (!entry && (!cats.length || !boxes.length))
    return <div className="s3-note">Xarajat turlari yoki kassa sozlanmagan. Ularni Hisob-kitob › Kirim-chiqim’da qo‘shing.</div>;

  const save = () =>
    start(async () => {
      const debit = fitted ? c!.acc : entry!.debit;
      const credit = fitted ? box : entry!.credit;
      const description = (entry ? note.trim() : `${c!.n} — ${note.trim()}`).slice(0, 300);
      const res = await addJournalEntryAction({
        id: entry?.id,
        date,
        doc: '',
        description,
        debit,
        credit,
        amount: sum,
        cat: fitted ? c!.k : (entry?.cat ?? null),
      });
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
            <span>Xarajat turi *</span>
            <select id={`s3-cat-${entry?.id ?? 'new'}`} className="sx-inp" value={cat} onChange={(e) => setCat(e.target.value)} required>
              <option value="" disabled>
                — turini tanlang —
              </option>
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
      {fitted && <div className="s3-hint">{hint ?? 'Avval xarajat turini tanlang — statistika va keyingi oy prognozi shu turga qarab hisoblanadi.'}</div>}
    </form>
  );
}

const chipOf = (k: ForecastKind) => (k === 'few' ? 'x' : k === 'frequent' ? 'f' : k === 'periodic' ? 'p' : 'm');

/** Keyingi oy prognozi: every type from its own recurrence, payroll from
 * the last posted month, and last month's forecast checked against reality. */
function Forecast({ books, cats, ym, today, canBook }: { books: BooksLite; cats: ExpenseCat[]; ym: string; today: string; canBook: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const currentYm = today.slice(0, 7);
  const target = addMonthsYm(ym, 1);
  const asOf = ym >= currentYm ? nextDay(today) : `${target}-01`;
  const cycles = useMemo(() => Object.fromEntries(cats.map((c) => [c.k, c.cycle])), [cats]);
  const F = useMemo(() => forecastMonth(books.accounts, books.entries, cycles, asOf, target), [books, cycles, asOf, target]);
  const btMonth = ym < currentYm ? ym : prevYm(ym);
  const B = useMemo(() => backtest(books.accounts, books.entries, cycles, btMonth), [books, cycles, btMonth]);
  const accName = (code: string) => books.accounts.find((a) => a.code === code)?.name ?? code;
  const nameOf = (k: string) => (k.startsWith('acc:') ? `${accName(k.slice(4))} (turi yo‘q)` : (cats.find((c) => c.k === k)?.n ?? k));
  const setCycle = (k: string, v: Cycle) =>
    start(async () => {
      const res = await setCashCatCycleAction(k, v);
      if (res.error) return void toast.error(errText(res.error));
      toast.success('Takrorlanish saqlandi — prognoz qayta hisoblandi');
      router.refresh();
    });
  const few = F.types.filter((t) => t.kind === 'few').length;

  return (
    <section className="sx-card s3-card">
      <div className="s3-ch">
        <h3>Keyingi oy prognozi · {monthName(target)}</h3>
        <span className="s3-src">har tur o‘z takrorlanishidan · ish haqi Moliya’dan</span>
      </div>
      <div className="s3-fc-sum">
        <div>
          <div className="s3-k">Jami prognoz</div>
          <b className="tabular-nums">{som(F.total)} so‘m</b>
        </div>
        <div>
          <div className="s3-k">Ish haqi</div>
          <span className="tabular-nums">{F.payroll ? `${som(F.payroll.amount)} · ${monthName(F.payroll.month)} bo‘yicha` : 'hali hisoblanmagan'}</span>
        </div>
        <div>
          <div className="s3-k">{monthName(btMonth)} tekshiruvi</div>
          <span className="tabular-nums">
            {B.actual > 0 ? `prognoz ${som(B.forecast)} · haqiqiy ${som(B.actual)} · aniqlik ${B.accuracy}%` : 'bu oy xarajat yozilmagan'}
          </span>
        </div>
      </div>
      {few > 0 && (
        <div className="s3-note">
          {few} ta turda ma’lumot kam: so‘nggi 4 oyning 3 tasidan kamida uchragan. Ular prognozga 0 qo‘shadi — takrorlanishini qo‘lda belgilang.
        </div>
      )}
      {!F.types.length ? (
        <div className="s3-empty">So‘nggi 180 kunda xarajat yozilmagan — prognoz uchun ma’lumot yo‘q</div>
      ) : (
        <div className="s3-fc-wrap">
          <table className="s3-fc-t">
            <thead>
              <tr>
                <th>Tur</th>
                <th>Takrorlanish</th>
                <th className="r">Aylanish</th>
                <th className="r">1 to‘lov</th>
                <th>Oxirgi</th>
                <th className="r">{monthName(target)}</th>
                <th>Hisob asosi</th>
              </tr>
            </thead>
            <tbody>
              {F.payroll && (
                <tr>
                  <td>Ish haqi va soliqlari</td>
                  <td>
                    <span className="s3-chip m">Oylik · avto</span>
                  </td>
                  <td className="r">—</td>
                  <td className="r">—</td>
                  <td>Moliya</td>
                  <td className="r">{som(F.payroll.amount)}</td>
                  <td className="why">oxirgi hisoblangan oy ({monthName(F.payroll.month)})</td>
                </tr>
              )}
              {F.types.map((t) => (
                <tr key={t.key}>
                  <td>{nameOf(t.key)}</td>
                  <td>
                    {canBook && !t.key.startsWith('acc:') ? (
                      <select
                        id={`s3-cyc-${t.key}`}
                        className="sx-inp s3-cyc"
                        aria-label={`${nameOf(t.key)}: takrorlanishi`}
                        value={t.cycle}
                        disabled={pending}
                        onChange={(e) => setCycle(t.key, e.target.value as Cycle)}
                      >
                        {CYCLES.map((v) => (
                          <option key={v} value={v}>
                            {v === 'auto' ? `Avto${t.cycle === 'auto' ? `: ${KIND_NAME[t.kind]}` : ''}` : CYCLE_NAME[v]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={cn('s3-chip', chipOf(t.kind))}>{KIND_NAME[t.kind]}</span>
                    )}
                  </td>
                  <td className="r">{t.gapDays ? `~${t.gapDays} kun` : '—'}</td>
                  <td className="r">{t.perPayment ? som(t.perPayment) : '—'}</td>
                  <td>{t.last ? ddmm(t.last) : '—'}</td>
                  <td className="r">{som(t.amount)}</td>
                  <td className="why">{t.basis}</td>
                </tr>
              ))}
              <tr className="tot">
                <td colSpan={5}>Jami</td>
                <td className="r">{som(F.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
