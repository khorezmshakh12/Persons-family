'use client';

import { isCashCode, PAY_CAT_NAME, PAY_SOURCE, templateDoc, type CashCat } from '@/lib/accounting-cash';
import type { Books } from '@/lib/accounting-data';
import { useRef, useState } from 'react';
import { Banknote, Check, CreditCard, Download, EyeOff, Paperclip, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cashWeeks, fmtMln, fmtNum, monthEnd, monthStart } from '@/lib/accounting';
import { CASH_BUCKETS, cashForecast } from '@/lib/accounting-ma';
import {
  addCashBoxAction,
  addJournalEntryAction,
  applyCashTemplatesAction,
  deleteCashCatAction,
  renameCashBoxAction,
  saveCashCatAction,
  deleteCashTemplateAction,
  deleteJournalEntryAction,
  getReceiptUrlAction,
  requestReceiptUploadAction,
  saveCashTemplateAction,
  setEntryReceiptAction,
} from '@/lib/actions/accounting';
import { ask, toast } from './suite-shell';
import { Chart } from './charts';
import { MoneyInput } from '@/components/ui/money-input';
import { downloadCsv, err, useRun } from './accounting-shared';

/* ------------------------------------------------------------------ MA · cash */
export function MaCash({ books, today, ym }: { books: Books; today: string; ym: string }) {
  const W = cashWeeks(books.accounts, books.opening, books.entries, today, 13);
  const min = books.tax.minCash;
  const low = W.filter((w) => w.closing < min).length;
  const inflow = W.reduce((a, w) => a + w.inflow, 0);
  const outflow = W.reduce((a, w) => a + w.outflow, 0);
  const lbl = (s: string) => `${+s.slice(8, 10)}.${s.slice(5, 7)}`;
  return (
    <div className="sx-grid">
      <CashBook books={books} today={today} ym={ym} />
      <div className="sx-card sx-stat dark s4">
        <div className="l">Hozirgi pul qoldig‘i</div>
        <div className="v">{fmtMln(W.at(-1)?.closing ?? 0)}</div>
        <div className="d">Kassa + bank</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">13 haftalik kirim / chiqim</div>
        <div className="v">{fmtMln(inflow - outflow)}</div>
        <div className="d">
          +{fmtMln(inflow)} / −{fmtMln(outflow)}
        </div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Minimal zaxira ({fmtMln(min)})</div>
        <div className="v" style={{ color: low ? 'var(--au-bad)' : 'var(--au-ok)' }}>{low ? `${low} hafta past` : 'Xavfsiz'}</div>
        <div className="d">Chegarani «Soliq & ish haqi» sozlamalarida o‘zgartiring</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>13 haftalik pul oqimi</h3>
          <small>haftalar dushanbadan · kassa va bank harakati</small>
        </div>
        <Chart
          labels={W.map((w) => lbl(w.from))}
          fmt={fmtMln}
          series={[
            { n: 'Kirim', c: '#139a52', v: W.map((w) => w.inflow) },
            { n: 'Chiqim', c: '#e8567a', v: W.map((w) => -w.outflow) },
            { n: 'Qoldiq', c: '#17161a', v: W.map((w) => w.closing), kind: 'line' },
            { n: 'Minimal zaxira', c: '#c7322b', v: W.map(() => min), kind: 'line', dash: true },
          ]}
        />
        <div className="sx-tw mt-4">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Hafta</th>
                <th>Kirim</th>
                <th>Chiqim</th>
                <th>Sof</th>
                <th>Qoldiq</th>
              </tr>
            </thead>
            <tbody>
              {W.map((w, i) => (
                <tr key={w.from} style={{ animationDelay: `${i * 20}ms` }}>
                  <td className="l">
                    {lbl(w.from)} – {lbl(w.to)}
                  </td>
                  <td>{fmtNum(w.inflow)}</td>
                  <td>{fmtNum(w.outflow)}</td>
                  <td style={{ color: w.inflow - w.outflow < 0 ? 'var(--au-bad)' : undefined }}>{fmtNum(w.inflow - w.outflow)}</td>
                  <td style={{ color: w.closing < min ? 'var(--au-bad)' : undefined }}>{fmtNum(w.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CashForecast books={books} today={today} min={min} />
    </div>
  );
}

/** Kirim / chiqim daftari: add, edit and delete cash movements for the month
 * by category — no debit/credit, no account codes. */
function CashBook({ books, today, ym }: { books: Books; today: string; ym: string }) {
  const { run, pending } = useRun();
  const has = (c: string) => books.accounts.some((a) => a.code === c);
  // Hidden categories still name old rows; only active ones are offered.
  const allCats = books.cats.filter((c) => has(c.acc));
  const cats = allCats.filter((c) => c.active);
  const methods = books.boxes.map((b) => b.code);
  const defDate = today.slice(0, 7) === ym ? today : monthStart(ym);
  const blank = { dir: 'in' as 'in' | 'out', cat: cats.find((c) => c.dir === 'in')?.k ?? '', method: methods[0] ?? '5010', date: defDate, amount: null as number | null, note: '' };
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState<string | null>(null);
  // An edited entry keeps its doc tag (TPL:<id> marks a template entry).
  const [editDoc, setEditDoc] = useState('');
  const [fYm, setFYm] = useState(ym);
  if (fYm !== ym) {
    setFYm(ym);
    setF((x) => ({ ...x, date: defDate }));
  }
  const [q, setQ] = useState('');
  const [dirF, setDirF] = useState<'all' | 'in' | 'out'>('all');
  const isCash = isCashCode;
  const catOf = (e: Books['entries'][number]): CashCat | undefined => {
    // Salary / advance paid from Ish haqi — one category, whatever the role.
    if (e.source?.startsWith(PAY_SOURCE)) return { k: 'pay', n: PAY_CAT_NAME, dir: 'out', acc: e.debit };
    const dir = isCash(e.debit) ? 'in' : 'out';
    const other = dir === 'in' ? e.credit : e.debit;
    const list = allCats.filter((c) => c.dir === dir && c.acc === other);
    return list.find((c) => e.description.startsWith(c.n)) ?? list[0];
  };
  const accName = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? '—';
  const boxName = (c: string) => books.boxes.find((b) => b.code === c)?.name ?? accName(c);
  const rows = books.entries
    .filter((e) => e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym))
    .filter((e) => isCash(e.debit) !== isCash(e.credit))
    .map((e) => {
      const dir: 'in' | 'out' = isCash(e.debit) ? 'in' : 'out';
      const cat = catOf(e);
      return { e, dir, cat, label: cat?.n ?? accName(dir === 'in' ? e.credit : e.debit), method: dir === 'in' ? e.debit : e.credit };
    })
    .filter((r) => dirF === 'all' || r.dir === dirF)
    .filter((r) => !q || `${r.e.description} ${r.label}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.e.entry_date.localeCompare(a.e.entry_date));
  const tin = rows.filter((r) => r.dir === 'in').reduce((a, r) => a + r.e.amount, 0);
  const tout = rows.filter((r) => r.dir === 'out').reduce((a, r) => a + r.e.amount, 0);
  // An edited row keeps its (possibly hidden) category selectable.
  const curCats = allCats.filter((c) => c.dir === f.dir && (c.active || c.k === f.cat));
  const submit = () => {
    const cat = allCats.find((c) => c.k === f.cat);
    if (!cat || !f.amount || f.amount <= 0) return toast.error('Toifa va summani kiriting');
    const description = f.note.trim() ? `${cat.n} — ${f.note.trim()}` : cat.n;
    const [debit, credit] = cat.dir === 'in' ? [f.method, cat.acc] : [cat.acc, f.method];
    run(
      () => addJournalEntryAction({ id: editId ?? undefined, date: f.date, doc: editId ? editDoc : '', description, debit, credit, amount: f.amount ?? 0 }),
      editId ? 'Yozuv saqlandi' : cat.dir === 'in' ? 'Kirim qo‘shildi' : 'Chiqim qo‘shildi',
      () => {
        setF({ ...blank, dir: f.dir, cat: f.cat, method: f.method, date: f.date });
        setEditId(null);
      },
    );
  };
  const startEdit = (r: (typeof rows)[number]) => {
    const cat = r.cat;
    const note = cat && r.e.description.startsWith(`${cat.n} — `) ? r.e.description.slice(cat.n.length + 3) : cat && r.e.description === cat.n ? '' : r.e.description;
    setEditId(r.e.id);
    setEditDoc(r.e.doc ?? '');
    setF({ dir: r.dir, cat: cat?.k ?? '', method: r.method, date: r.e.entry_date, amount: r.e.amount, note });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <>
      <CashBoxes books={books} />
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>{editId ? 'Yozuvni tahrirlash' : 'Kirim / chiqim qo‘shish'}</h3>
          <small>pul kelganda yoki ketganda shu yerga yozing — hisobotlar avtomatik yangilanadi</small>
        </div>
        <div className="mb-3 inline-flex rounded-xl border border-au-line bg-au-card-2 p-1">
          {(
            [
              ['in', 'Kirim'],
              ['out', 'Chiqim'],
            ] as const
          ).map(([d, n]) => (
            <button
              key={d}
              className={cn('sx-chipb !border-0', f.dir === d && 'on')}
              onClick={() => setF({ ...f, dir: d, cat: cats.find((c) => c.dir === d)?.k ?? '' })}
            >
              {d === 'in' ? '↓' : '↑'} {n}
            </button>
          ))}
        </div>
        <div className="sx-form">
          <label className="min-w-[220px] flex-1">
            Toifa
            <select className="sx-inp" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
              {curCats.map((c) => (
                <option key={c.k} value={c.k}>
                  {c.n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Summa, so‘m
            <MoneyInput
              className="sx-inp !w-[170px] text-right"
              value={f.amount}
              onValue={(v) => setF({ ...f, amount: v })}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <label>
            Qanday
            <select className="sx-inp !w-[150px]" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {boxName(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sana
            <input type="date" className="sx-inp" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} />
          </label>
          <label className="min-w-[200px] flex-1">
            Izoh
            <input className="sx-inp" maxLength={200} placeholder="Masalan: Ali Valiyev, oktyabr" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={submit}>
            {editId ? 'Saqlash' : (
              <>
                <Plus className="size-4" /> Qo‘shish
              </>
            )}
          </button>
          {editId && (
            <button
              className="sx-btn"
              onClick={() => {
                setEditId(null);
                setF(blank);
              }}
            >
              Bekor qilish
            </button>
          )}
          {!editId && (
            <button
              className="sx-btn"
              disabled={pending}
              title="Ijara, internet kabi har oy bir xil to‘lovlar uchun"
              onClick={() => {
                if (!f.cat || !f.amount || f.amount <= 0) return toast.error('Toifa va summani kiriting');
                run(
                  () => saveCashTemplateAction({ cat: f.cat, method: f.method, amount: f.amount ?? 0, note: f.note, day: Math.min(28, +f.date.slice(8, 10) || 1) }),
                  'Shablon saqlandi — «Har oy takrorlanadigan» ro‘yxatida',
                );
              }}
            >
              <Repeat className="size-4" /> Har oy takrorlash
            </button>
          )}
        </div>
      </div>
      <Templates books={books} ym={ym} />
      <CashCategories books={books} />
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kirim-chiqim daftari</h3>
          <small>
            {ym} · kirim <b className="text-au-ok">{fmtNum(tin)}</b> · chiqim <b className="text-au-bad">{fmtNum(tout)}</b> · sof{' '}
            <b>{fmtNum(tin - tout)}</b> so‘m
          </small>
          <span className="sp" />
          {(
            [
              ['all', 'Hammasi'],
              ['in', 'Kirim'],
              ['out', 'Chiqim'],
            ] as const
          ).map(([k, n]) => (
            <button key={k} className={cn('sx-chipb', dirF === k && 'on')} onClick={() => setDirF(k)}>
              {n}
            </button>
          ))}
          <input className="sx-inp !h-[32px] !w-[180px]" placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            className="sx-btn sm"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(`kirim-chiqim-${ym}.csv`, [
                ['Sana', 'Toifa', 'Izoh', 'Qanday', 'Kirim', 'Chiqim', 'Chek'],
                ...rows.map((r) => [
                  r.e.entry_date,
                  r.label,
                  r.e.description,
                  boxName(r.method),
                  r.dir === 'in' ? r.e.amount : '',
                  r.dir === 'out' ? r.e.amount : '',
                  r.e.receipt_path ? 'bor' : '',
                ]),
              ])
            }
          >
            <Download className="size-3.5" /> Excel (CSV)
          </button>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Sana</th>
                <th className="l">Toifa</th>
                <th className="l">Izoh</th>
                <th className="l">Qanday</th>
                <th>Kirim</th>
                <th>Chiqim</th>
                <th>Chek</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="l">
                    <div className="sx-empty">Bu oy uchun kirim yoki chiqim yozilmagan — yuqoridagi formadan qo‘shing.</div>
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.e.id} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }} className={cn(editId === r.e.id && 'bg-au-accent-soft')}>
                  <td className="l tabular-nums">{r.e.entry_date.split('-').reverse().join('.')}</td>
                  <td className="l">
                    <b>{r.label}</b>
                  </td>
                  <td className="l text-au-muted">{r.cat && r.e.description.startsWith(r.cat.n) ? r.e.description.slice(r.cat.n.length).replace(/^ — /, '') : r.e.description}</td>
                  <td className="l text-au-muted">{boxName(r.method)}</td>
                  <td className="text-au-ok">{r.dir === 'in' ? fmtNum(r.e.amount) : ''}</td>
                  <td className="text-au-bad">{r.dir === 'out' ? fmtNum(r.e.amount) : ''}</td>
                  <td>{r.e.source ? null : <ReceiptCell entryId={r.e.id} has={!!r.e.receipt_path} warn={r.dir === 'out'} />}</td>
                  <td>
                    {r.e.source ? (
                      <span
                        className="sx-pl info"
                        title={r.e.source.startsWith(PAY_SOURCE) ? 'Moliya › Ish haqi bo‘limidan avtomatik — o‘sha yerda tahrirlanadi' : 'Ish haqi / soliq / eskirish bo‘limidan avtomatik'}
                      >
                        AUTO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button className="sx-btn sm" aria-label="Tahrirlash" onClick={() => startEdit(r)}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          className="sx-btn sm text-au-bad"
                          aria-label="O'chirish"
                          disabled={pending}
                          onClick={async () =>
                            (await ask(`O‘chirilsinmi?\n${r.label} · ${fmtNum(r.e.amount)} so‘m`)) &&
                            run(() => deleteJournalEntryAction(r.e.id), 'Yozuv o‘chirildi', () => editId === r.e.id && (setEditId(null), setF(blank)))
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Forward 13-week projection from the last 13 weeks' real averages. */
function CashForecast({ books, today, min }: { books: Books; today: string; min: number }) {
  const f = cashForecast(books.accounts, books.opening, books.entries, today, 13, 13);
  const lbl = (s: string) => `${+s.slice(8, 10)}.${s.slice(5, 7)}`;
  const low = f.weeks.find((w) => w.closing < min);
  const minBal = Math.min(...f.weeks.map((w) => w.closing));
  return (
    <>
      <div className="sx-card sx-stat s4">
        <div className="l">13 hafta oxirida (prognoz)</div>
        <div className="v" style={{ color: (f.weeks.at(-1)?.closing ?? 0) >= f.opening ? 'var(--au-ok)' : 'var(--au-bad)' }}>{fmtMln(f.weeks.at(-1)?.closing ?? 0)}</div>
        <div className="d">hozir {fmtMln(f.opening)}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Eng past qoldiq (prognoz)</div>
        <div className="v" style={{ color: minBal < min ? 'var(--au-bad)' : undefined }}>{fmtMln(minBal)}</div>
      </div>
      <div className={cn('sx-card sx-stat s4', low && 'dark')}>
        <div className="l">Minimal zaxira chegarasi</div>
        <div className="v">{fmtMln(min)}</div>
        <div className="d">{low ? `${lbl(low.from)} haftasida chegaradan pastga tushadi` : 'Butun davrda xavfsiz'}</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>13 haftalik pul oqimi prognozi</h3>
          <small>oxirgi 13 haftadagi haqiqiy kirim/chiqimning haftalik o‘rtachasi bo‘yicha</small>
        </div>
        {f.avgIn === 0 && f.outTotal === 0 ? (
          <div className="sx-empty">Prognoz uchun oxirgi 13 haftada kassa/bank harakati yo‘q.</div>
        ) : (
          <>
            <Chart
              labels={f.weeks.map((w) => lbl(w.from))}
              fmt={fmtMln}
              series={[
                { n: 'Kirim', c: '#139a52', v: f.weeks.map((w) => w.inflow) },
                { n: 'Chiqim', c: '#e8567a', v: f.weeks.map((w) => -w.outflow) },
                { n: 'Hafta oxiri qoldig‘i', c: '#17161a', v: f.weeks.map((w) => w.closing), kind: 'line' },
                { n: 'Minimal zaxira', c: '#ff9f1c', v: f.weeks.map(() => min), kind: 'line', dash: true },
              ]}
            />
            <div className="sx-tw mt-4">
              <table className="sx-tbl">
                <thead>
                  <tr>
                    <th className="l">Hafta</th>
                    <th>Kirim</th>
                    {CASH_BUCKETS.map(([k, n]) => (
                      <th key={k}>{n}</th>
                    ))}
                    <th>Sof oqim</th>
                    <th>Qoldiq</th>
                  </tr>
                </thead>
                <tbody>
                  {f.weeks.map((w) => (
                    <tr key={w.from}>
                      <td className="l">{lbl(w.from)}</td>
                      <td style={{ color: 'var(--au-ok)' }}>{fmtMln(w.inflow)}</td>
                      {CASH_BUCKETS.map(([k]) => (
                        <td key={k}>{w.out[k] ? fmtMln(w.out[k]) : '—'}</td>
                      ))}
                      <td style={{ color: w.inflow - w.outflow < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>
                        <b>{fmtMln(w.inflow - w.outflow)}</b>
                      </td>
                      <td style={{ color: w.closing < min ? 'var(--au-bad)' : undefined }}>
                        <b>{fmtMln(w.closing)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Receipt photo / PDF behind one manual cash movement: attach, open,
 * replace or remove. An expense without one is flagged amber. */
function ReceiptCell({ entryId, has, warn }: { entryId: string; has: boolean; warn: boolean }) {
  const { run, pending } = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const u = await requestReceiptUploadAction(entryId, file.name, file.type, file.size);
      if (u.error || !u.url || !u.path) {
        toast.error(u.error === 'fileType' ? 'Faqat rasm (JPG/PNG/WEBP/HEIC) yoki PDF' : u.error === 'fileSize' ? 'Fayl 10 MB dan oshmasin' : err(u.error ?? ''));
        return;
      }
      const put = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) return void toast.error('Yuklab bo‘lmadi');
      const path = u.path;
      run(() => setEntryReceiptAction(entryId, path), 'Chek biriktirildi');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload(file);
        }}
      />
      {has ? (
        <>
          <button
            className="sx-btn sm text-au-ok"
            aria-label="Chekni ko‘rish"
            title="Chekni ko‘rish"
            onClick={async () => {
              const r = await getReceiptUrlAction(entryId);
              if (r.url) window.open(r.url, '_blank', 'noopener');
              else toast.error(err(r.error ?? ''));
            }}
          >
            <Paperclip className="size-3.5" /> ✓
          </button>
          <button
            className="sx-btn sm"
            aria-label="Chekni olib tashlash"
            disabled={pending}
            onClick={async () => (await ask('Chek olib tashlansinmi?')) && run(() => setEntryReceiptAction(entryId, null), 'Chek olib tashlandi')}
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      ) : (
        <button
          className={cn('sx-btn sm', warn && 'text-au-accent-text')}
          aria-label="Chek biriktirish"
          title={warn ? 'Chiqim uchun chek biriktiring' : 'Chek biriktirish'}
          disabled={busy || pending}
          onClick={() => input.current?.click()}
        >
          <Paperclip className="size-3.5" /> {busy ? '…' : '+'}
        </button>
      )}
    </span>
  );
}

/** Monthly recurring movements: one click writes this month's rent,
 * internet… (each once per month; an edited entry keeps its tag). */
function Templates({ books, ym }: { books: Books; ym: string }) {
  const { run, pending } = useRun();
  if (!books.templates.length) return null;
  const inMonth = (id: string) => books.entries.some((e) => e.doc === templateDoc(id) && e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym));
  const active = books.templates.filter((t) => t.active && t.from <= ym);
  const missing = active.filter((t) => !inMonth(t.id));
  const catName = (k: string) => books.cats.find((c) => c.k === k)?.n ?? k;
  const dirOf = (k: string) => books.cats.find((c) => c.k === k)?.dir ?? 'out';
  const boxName = (c: string) => books.boxes.find((b) => b.code === c)?.name ?? '—';
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Har oy takrorlanadigan</h3>
        <small>
          {active.length} ta faol · bu oyda {missing.length ? <b className="text-au-accent-text">{missing.length} tasi hali yozilmagan</b> : 'hammasi yozilgan'}
        </small>
        <span className="sp" />
        <button
          className="sx-btn primary sm"
          disabled={pending || !missing.length}
          onClick={() =>
            run(async () => {
              const r = await applyCashTemplatesAction(ym);
              if (!r.error) toast.success(r.count ? `${r.count} ta yozuv qo‘shildi` : 'Bu oy uchun hammasi allaqachon yozilgan');
              return r;
            })
          }
        >
          Bu oyga yozish ({missing.length})
        </button>
      </div>
      <div className="sx-tw">
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">Kuni</th>
              <th className="l">Toifa</th>
              <th className="l">Izoh</th>
              <th className="l">Qanday</th>
              <th>Summa</th>
              <th className="l">Bu oy</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {books.templates.map((t) => (
              <tr key={t.id} className={cn(!t.active && 'opacity-50')}>
                <td className="l tabular-nums">{t.day}-sana</td>
                <td className="l">
                  <b>{catName(t.cat)}</b>
                </td>
                <td className="l text-au-muted">{t.note || '—'}</td>
                <td className="l text-au-muted">{boxName(t.method)}</td>
                <td className={dirOf(t.cat) === 'in' ? 'text-au-ok' : 'text-au-bad'}>{fmtNum(t.amount)}</td>
                <td className="l">
                  {!t.active ? <span className="sx-pl">to‘xtatilgan</span> : inMonth(t.id) ? <span className="sx-pl ok">yozilgan</span> : <span className="sx-pl warn">kutilmoqda</span>}
                </td>
                <td>
                  <span className="inline-flex items-center gap-1">
                    <button
                      className="sx-btn sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            saveCashTemplateAction({
                              id: t.id,
                              cat: t.cat,
                              method: t.method,
                              amount: t.amount,
                              note: t.note,
                              day: t.day,
                              active: !t.active,
                            }),
                          t.active ? 'To‘xtatildi' : 'Yoqildi',
                        )
                      }
                    >
                      {t.active ? 'To‘xtatish' : 'Yoqish'}
                    </button>
                    <button
                      className="sx-btn sm text-au-bad"
                      aria-label="O‘chirish"
                      disabled={pending}
                      onClick={async () => (await ask(`Shablon o‘chirilsinmi?\n${catName(t.cat)} · ${fmtNum(t.amount)} so‘m`)) && run(() => deleteCashTemplateAction(t.id), 'O‘chirildi')}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Kassalar: every kassa / bank / karta with what is in it right now. Add a
 * new one (Click, Humo karta, filial kassasi…) or rename one in place. */
function CashBoxes({ books }: { books: Books }) {
  const { run, pending } = useRun();
  const [adding, setAdding] = useState<{ name: string; kind: 'cash' | 'bank' } | null>(null);
  const [rename, setRename] = useState<{ code: string; name: string } | null>(null);
  const balance = (code: string) =>
    books.entries.reduce((t, e) => t + (e.debit === code ? e.amount : 0) - (e.credit === code ? e.amount : 0), books.opening[code] ?? 0);
  const total = books.boxes.reduce((t, b) => t + balance(b.code), 0);
  const saveName = (r: { code: string; name: string }) => run(() => renameCashBoxAction(r), 'Nomi o‘zgardi', () => setRename(null));
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Kassalar</h3>
        <small>
          jami <b>{fmtNum(total)}</b> so‘m · ish haqi to‘lovlari ham shu yerdan avtomatik ayiriladi
        </small>
        <span className="sp" />
        {!adding && (
          <button className="sx-btn sm" onClick={() => setAdding({ name: '', kind: 'bank' })}>
            <Plus className="size-3.5" /> Kassa qo‘shish
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {books.boxes.map((b) => {
          const v = balance(b.code);
          const Icon = b.kind === 'cash' ? Banknote : CreditCard;
          return (
            <div key={b.code} className="flex flex-col gap-1.5 rounded-[20px] border border-au-line bg-au-card-2 p-4">
              {rename?.code === b.code ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    className="sx-inp !h-[32px] min-w-0 flex-1"
                    maxLength={60}
                    value={rename.name}
                    onChange={(e) => setRename({ ...rename, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && rename.name.trim().length >= 2 && saveName(rename)}
                  />
                  <button className="sx-btn sm" aria-label="Saqlash" disabled={pending || rename.name.trim().length < 2} onClick={() => saveName(rename)}>
                    <Check className="size-3.5" />
                  </button>
                  <button className="sx-btn sm" aria-label="Bekor" onClick={() => setRename(null)}>
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-au-ink">
                    <Icon className="size-4 shrink-0 text-au-muted" />
                    <span className="truncate">{b.name}</span>
                  </span>
                  <button className="sx-btn sm" aria-label="Nomini o‘zgartirish" onClick={() => setRename({ code: b.code, name: b.name })}>
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              )}
              <div className={cn('text-xl font-extrabold tabular-nums', v < 0 ? 'text-au-bad' : 'text-au-ink')}>
                {fmtNum(v)} <span className="text-xs font-semibold text-au-muted">so‘m</span>
              </div>
              <div className="text-[11px] text-au-muted">{b.kind === 'cash' ? 'Naqd' : 'Bank / karta'}</div>
            </div>
          );
        })}
        {adding && (
          <div className="flex flex-col gap-2 rounded-[20px] border border-dashed border-au-line p-4">
            <input
              autoFocus
              className="sx-inp"
              maxLength={60}
              placeholder="Nomi: masalan, Click yoki Filial kassasi"
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            />
            <div className="inline-flex w-fit rounded-xl border border-au-line bg-au-card-2 p-1">
              {(
                [
                  ['cash', 'Naqd'],
                  ['bank', 'Karta / bank'],
                ] as const
              ).map(([k, n]) => (
                <button key={k} className={cn('sx-chipb !border-0', adding.kind === k && 'on')} onClick={() => setAdding({ ...adding, kind: k })}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                className="sx-btn primary sm"
                disabled={pending || adding.name.trim().length < 2}
                onClick={() => run(() => addCashBoxAction(adding), 'Kassa qo‘shildi', () => setAdding(null))}
              >
                Qo‘shish
              </button>
              <button className="sx-btn sm" onClick={() => setAdding(null)}>
                Bekor
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type CatDraft = { k?: string; n: string; dir: 'in' | 'out'; acc: string };

/** Kategoriyalar: the cash book's own list — add, rename, re-point to an
 * account, hide. Hidden ones keep naming the rows already written. */
function CashCategories({ books }: { books: Books }) {
  const { run, pending } = useRun();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatDraft | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const accounts = books.accounts.filter((a) => !isCashCode(a.code) && a.type !== 'CA');
  const accName = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? c;
  const save = (d: CatDraft) =>
    run(() => saveCashCatAction({ ...d, n: d.n.trim(), active: true }), d.k ? 'Kategoriya saqlandi' : 'Kategoriya qo‘shildi', () => setDraft(null));
  const hidden = books.cats.filter((c) => !c.active).length;

  const editor = (d: CatDraft) => (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-au-accent-soft p-2">
      <input
        autoFocus
        className="sx-inp !h-[32px] min-w-[180px] flex-1"
        maxLength={80}
        placeholder="Kategoriya nomi"
        value={d.n}
        onChange={(e) => setDraft({ ...d, n: e.target.value })}
      />
      <select className="sx-inp !h-[32px] !w-auto" value={d.acc} onChange={(e) => setDraft({ ...d, acc: e.target.value })} aria-label="Qaysi hisobga tushadi">
        {accounts.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </select>
      <button className="sx-btn primary sm" disabled={pending || !d.n.trim() || !d.acc} onClick={() => save(d)}>
        Saqlash
      </button>
      <button className="sx-btn sm" onClick={() => setDraft(null)}>
        Bekor
      </button>
    </div>
  );

  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Kategoriyalar</h3>
        <small>
          {books.cats.length - hidden} ta faol{hidden ? ` · ${hidden} ta yashirilgan` : ''}
        </small>
        <span className="sp" />
        <button className="sx-btn sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Yopish' : 'Boshqarish'}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(['in', 'out'] as const).map((dir) => {
            const list = books.cats.filter((c) => c.dir === dir && (showHidden || c.active));
            const defAcc = accounts.find((a) => a.type === (dir === 'in' ? 'R' : 'X'))?.code ?? '';
            return (
              <div key={dir} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <b className={dir === 'in' ? 'text-au-ok' : 'text-au-bad'}>{dir === 'in' ? '↓ Kirim' : '↑ Chiqim'}</b>
                  {!draft && (
                    <button className="sx-btn sm" onClick={() => setDraft({ n: '', dir, acc: defAcc })}>
                      <Plus className="size-3.5" /> Qo‘shish
                    </button>
                  )}
                </div>
                {draft && !draft.k && draft.dir === dir && editor(draft)}
                <ul className="flex flex-col divide-y divide-au-line">
                  {list.map((c) =>
                    draft?.k === c.k ? (
                      <li key={c.k} className="py-1.5">
                        {editor(draft)}
                      </li>
                    ) : (
                      <li key={c.k} className={cn('flex items-center gap-2 py-2', !c.active && 'opacity-50')}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-au-ink">{c.n}</span>
                          <span className="block truncate text-[11px] text-au-muted">{accName(c.acc)}</span>
                        </span>
                        {c.active ? (
                          <>
                            <button className="sx-btn sm" aria-label="Tahrirlash" onClick={() => setDraft({ k: c.k, n: c.n, dir: c.dir, acc: c.acc })}>
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              className="sx-btn sm"
                              aria-label="Yashirish"
                              title="Formadan olib tashlash (eski yozuvlarda nomi qoladi)"
                              disabled={pending}
                              onClick={() => run(() => deleteCashCatAction(c.k), 'Yashirildi')}
                            >
                              <EyeOff className="size-3.5" />
                            </button>
                          </>
                        ) : (
                          <button className="sx-btn sm" disabled={pending} onClick={() => save(c)}>
                            Qaytarish
                          </button>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            );
          })}
          {hidden > 0 && (
            <button className="sx-btn sm w-fit" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? 'Yashirilganlarni berkitish' : `Yashirilganlarni ko‘rsatish (${hidden})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
