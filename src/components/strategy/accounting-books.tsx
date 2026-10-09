'use client';

import type { Books } from '@/lib/accounting-data';
import { Fragment, useEffect, useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JOURNAL_TEMPLATES, addMonths, debitNormal, assetOnBooks, depreciation, fmtMln, fmtNum, ledger, monthEnd, monthStart, payrollTaxes, statements, taxCompare, type TaxSettings } from '@/lib/accounting';
import { cashFlowStatement, nbvByCategory, ratios, reconcile, taxCalendar } from '@/lib/accounting-ma';
import { addAssetAction, addJournalEntryAction, deleteAssetAction, deleteJournalEntryAction, disposeAssetAction, getPayrollForMonthAction, postDepreciationAction, postPayrollAction, postTurnoverTaxAction, saveTaxSettingsAction, setOpeningBalancesAction, type PayrollLine } from '@/lib/actions/accounting';
import { ask, toast } from './suite-shell';
import { Chart } from './charts';
import { MoneyInput } from '@/components/ui/money-input';
import { err, pct, useRun, downloadCsv } from './accounting-shared';

/* ---------------------------------------------------------------- FA · journal */
export function FaJournal({ books, ym, today }: { books: Books; ym: string; today: string }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ date: today.slice(0, 7) === ym ? today : monthStart(ym), doc: '', description: '', debit: '5110', credit: '9030', amount: null as number | null });
  // Keep the default entry date inside the month picked above.
  const [fYm, setFYm] = useState(ym);
  if (fYm !== ym) {
    setFYm(ym);
    setF((x) => ({ ...x, date: today.slice(0, 7) === ym ? today : monthStart(ym) }));
  }
  const [q, setQ] = useState('');
  const [acc, setAcc] = useState('all');
  const [editId, setEditId] = useState<string | null>(null);
  const blank = { doc: '', description: '', amount: null as number | null };
  const name = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? c;
  const list = books.entries
    .filter((e) => e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym))
    .filter((e) => acc === 'all' || e.debit === acc || e.credit === acc)
    .filter((e) => !q || `${e.description} ${e.doc}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const total = list.reduce((a, e) => a + e.amount, 0);
  const submit = () => {
    const amount = f.amount ?? 0;
    if (!f.description.trim() || !(amount > 0) || f.debit === f.credit) return toast.error("Yozuv to'liq emas: tavsif, summa va turli hisoblar kerak");
    run(() => addJournalEntryAction({ ...f, amount, id: editId ?? undefined }), editId ? 'Yozuv saqlandi' : 'Yozuv jurnalga qo‘shildi', () => {
      setF({ ...f, ...blank });
      setEditId(null);
    });
  };
  const accSel = (k: 'debit' | 'credit') => (
    <select className="sx-inp !w-[220px]" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
      {books.accounts.map((a) => (
        <option key={a.code} value={a.code}>
          {a.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>{editId ? 'Provodkani tahrirlash' : 'Yangi provodka'}</h3>
          <small>Dt / Kt — ikki tomonlama yozuv</small>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {JOURNAL_TEMPLATES.map(([n, dt, kt]) => (
            <button key={n} className={cn('sx-chipb', f.debit === dt && f.credit === kt && 'on')} onClick={() => setF({ ...f, debit: dt, credit: kt, description: f.description || n })}>
              {n}
            </button>
          ))}
        </div>
        <div className="sx-form">
          <label>
            Sana
            <input type="date" className="sx-inp" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} />
          </label>
          <label>
            Hujjat №
            <input className="sx-inp !w-[100px]" maxLength={40} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
          </label>
          <label className="min-w-[220px] flex-1">
            Tavsif
            <input className="sx-inp" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <label>
            Debet
            {accSel('debit')}
          </label>
          <label>
            Kredit
            {accSel('credit')}
          </label>
          <label>
            Summa, so‘m
            <MoneyInput
              className="sx-inp !w-[150px] text-right"
              value={f.amount}
              onValue={(v) => setF({ ...f, amount: v })}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={submit}>
            {editId ? 'Saqlash' : <><Plus className="size-4" /> Provodka qilish</>}
          </button>
          {editId && (
            <button className="sx-btn" onClick={() => { setEditId(null); setF({ ...f, ...blank }); }}>
              Bekor qilish
            </button>
          )}
        </div>
        <JournalCheck debit={f.debit} credit={f.credit} amount={f.amount ?? 0} name={name} />
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Jurnal</h3>
          <small>
            {list.length} ta yozuv · {fmtNum(total)} so‘m
          </small>
          <span className="sp" />
          <button
            className="sx-btn sm"
            disabled={!list.length}
            onClick={() =>
              downloadCsv(`jurnal-${ym}.csv`, [
                ['Sana', 'Hujjat', 'Tavsif', 'Debet', 'Kredit', 'Summa'],
                ...list.map((e) => [e.entry_date, e.doc, e.description, name(e.debit), name(e.credit), e.amount]),
              ])
            }
          >
            CSV
          </button>
          <input className="sx-inp !h-[32px] !w-[200px]" placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="sx-inp !h-[32px] !w-[200px]" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="all">Barcha hisoblar</option>
            {books.accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Sana</th>
                <th className="l">Hujjat</th>
                <th className="l">Tavsif</th>
                <th className="l" title="Debet (Dt) — hisobning chap tomoni: aktiv va xarajat ko‘payadi, majburiyat va daromad kamayadi">Debet</th>
                <th className="l" title="Kredit (Kt) — hisobning o‘ng tomoni: majburiyat va daromad ko‘payadi, aktiv kamayadi">Kredit</th>
                <th>Summa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="l">
                    <div className="sx-empty">Bu oy uchun yozuv yo‘q</div>
                  </td>
                </tr>
              )}
              {list.map((e, i) => (
                <tr key={e.id} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                  <td className="l tabular-nums">{e.entry_date.split('-').reverse().join('.')}</td>
                  <td className="l">{e.source ? <span className="sx-pl info">AUTO</span> : e.doc}</td>
                  <td className="l">{e.description}</td>
                  <td className="l">{name(e.debit)}</td>
                  <td className="l">{name(e.credit)}</td>
                  <td>{fmtNum(e.amount)}</td>
                  <td>
                    {!e.source && (
                      <span className="inline-flex items-center gap-1">
                      <button
                        className="sx-btn sm"
                        aria-label="Tahrirlash"
                        onClick={() => {
                          setEditId(e.id);
                          setF({ date: e.entry_date, doc: e.doc ?? '', description: e.description, debit: e.debit, credit: e.credit, amount: e.amount });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="sx-btn sm text-au-bad" onClick={async () => (await ask(`Yozuv o'chirilsinmi?
${name(e.debit)} → ${name(e.credit)} · ${fmtNum(e.amount)} · ${e.description}`)) && run(() => deleteJournalEntryAction(e.id), "Yozuv o'chirildi")} aria-label="O'chirish">
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
        <p className="sx-note">AUTO yozuvlar (ish haqi, eskirish, soliq) tegishli bo‘limdan qayta o‘tkazilganda yangilanadi.</p>
      </div>
    </div>
  );
}

/** Live double-entry preview: the same amount lands on both sides. */
function JournalCheck({ debit, credit, amount, name }: { debit: string; credit: string; amount: number; name: (c: string) => string }) {
  const same = debit === credit;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-au-line bg-au-card-2 p-3 text-sm">
      <div className="min-w-[180px] flex-1">
        <div className="text-[11px] font-bold text-au-muted uppercase" title="Debet (Dt) — hisobning chap tomoni: aktiv va xarajat ko‘payadi, majburiyat va daromad kamayadi">Debet</div>
        <b>
          {name(debit)}
        </b>
        <div className="tabular-nums text-au-ok">+ {fmtNum(amount)}</div>
      </div>
      <b className="text-xl">{same ? '≠' : '='}</b>
      <div className="min-w-[180px] flex-1">
        <div className="text-[11px] font-bold text-au-muted uppercase" title="Kredit (Kt) — hisobning o‘ng tomoni: majburiyat va daromad ko‘payadi, aktiv kamayadi">Kredit</div>
        <b>
          {name(credit)}
        </b>
        <div className="tabular-nums text-au-ok">+ {fmtNum(amount)}</div>
      </div>
      <span className={cn('sx-pl', same ? 'bad' : amount <= 0 ? 'warn' : 'ok')}>
        {same ? 'Debet va kredit bir xil bo‘lmasin' : amount <= 0 ? 'Summani kiriting' : 'Balans saqlanadi'}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- FA · ledger */
/** UTF-8 (with BOM, so Excel reads Cyrillic/Uzbek) CSV download. */

export function FaLedger({ books, ym }: { books: Books; ym: string }) {
  const { run, pending } = useRun();
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const lines = books.accounts.map((a) => L[a.code]);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [ob, setOb] = useState<Record<string, number>>(() => ({ ...books.opening }));
  const tD = lines.reduce((a, l) => a + l.debit, 0);
  const tK = lines.reduce((a, l) => a + l.credit, 0);
  const obD = books.accounts.filter((a) => debitNormal(a.type)).reduce((s, a) => s + (ob[a.code] ?? 0), 0);
  const obK = books.accounts.filter((a) => !debitNormal(a.type)).reduce((s, a) => s + (ob[a.code] ?? 0), 0);
  const sideAmt = (v: number, dn: boolean, want: 'd' | 'k') => {
    const d = dn ? v : -v;
    return want === 'd' ? (d > 0 ? fmtNum(d) : '') : d < 0 ? fmtNum(-d) : '';
  };
  const rows = open
    ? books.entries.filter((e) => (e.debit === open || e.credit === open) && e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym))
    : [];
  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Aylanma-saldo vedomosti</h3>
          <small>{ym} · Qatorni bosing — hisob kartochkasi ochiladi</small>
          <span className={cn('sx-pl', Math.abs(tD - tK) < 0.01 ? 'ok' : 'bad')}>
            {Math.abs(tD - tK) < 0.01 ? 'Dt = Kt' : `Dt ≠ Kt (${fmtNum(tD - tK)})`}
          </span>
          <span className="sp" />
          <button className="sx-btn sm" onClick={() => setEdit((v) => !v)}>
            {edit ? 'Yopish' : 'Boshlang‘ich qoldiqlar'}
          </button>
        </div>
        {edit && (
          <div className="mb-4 rounded-xl border border-au-line bg-au-card-2 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-au-muted">
              Hisob yuritish boshlangan kundagi qoldiqlar (tabiiy tomonida).
              <span className={cn('sx-pl', Math.abs(obD - obK) < 0.01 ? 'ok' : 'bad')}>
                Dt {fmtNum(obD)} · Kt {fmtNum(obK)}{Math.abs(obD - obK) >= 0.01 ? ` · farq ${fmtNum(obD - obK)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {books.accounts
                .filter((a) => a.type !== 'R' && a.type !== 'X')
                .map((a) => (
                  <label key={a.code} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {a.name}
                    </span>
                    <MoneyInput
                      className="sx-plain-inp !w-[130px]"
                      value={ob[a.code] ?? 0}
                      onValue={(v) => setOb({ ...ob, [a.code]: v ?? 0 })}
                    />
                  </label>
                ))}
            </div>
            <button
              className="sx-btn primary sm mt-3"
              disabled={pending}
              onClick={async () =>
                (Math.abs(obD - obK) < 0.01 ||
                  (await ask(`Qoldiqlar muvozanatda emas (Dt − Kt = ${fmtNum(obD - obK)}). Balans teng chiqmaydi. Baribir saqlansinmi?`, { ok: 'Baribir saqlash', danger: false }))) &&
                run(() => setOpeningBalancesAction(ob), 'Boshlang‘ich qoldiqlar saqlandi', () => setEdit(false))
              }
            >
              Saqlash
            </button>
          </div>
        )}
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Hisob</th>
                <th>Boshi Dt</th>
                <th>Boshi Kt</th>
                <th>Aylanma Dt</th>
                <th>Aylanma Kt</th>
                <th>Oxirgi qoldiq Dt</th>
                <th>Oxirgi qoldiq Kt</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const dn = debitNormal(l.type);
                return (
                  <tr key={l.code} style={{ animationDelay: `${i * 15}ms`, cursor: 'pointer' }} onClick={() => setOpen(open === l.code ? null : l.code)}>
                    <td className="l">{l.name}</td>
                    <td>{sideAmt(l.openingPeriod, dn, 'd')}</td>
                    <td>{sideAmt(l.openingPeriod, dn, 'k')}</td>
                    <td>{l.debit ? fmtNum(l.debit) : ''}</td>
                    <td>{l.credit ? fmtNum(l.credit) : ''}</td>
                    <td>{sideAmt(l.closing, dn, 'd')}</td>
                    <td>{sideAmt(l.closing, dn, 'k')}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Jami aylanma</td>
                <td />
                <td />
                <td>{fmtNum(tD)}</td>
                <td>{fmtNum(tK)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {open && L[open] && <TAccount line={L[open]} rows={rows} name={(c) => books.accounts.find((a) => a.code === c)?.name ?? '—'} />}
    </div>
  );
}

/** Account card as a T-account (debit | credit) with the running balance. */
function TAccount({ line, rows, name }: { line: ReturnType<typeof ledger>[string]; rows: Books['entries']; name: (c: string) => string }) {
  const dn = debitNormal(line.type);
  const code = line.code;
  const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const run = sorted.reduce<number[]>((acc, e) => [...acc, (acc.at(-1) ?? line.openingPeriod) + (e.debit === code ? 1 : -1) * (dn ? 1 : -1) * e.amount], []);
  const side = (d: boolean) => sorted.filter((e) => (e.debit === code) === d);
  const openSide = line.openingPeriod === 0 ? null : (line.openingPeriod > 0) === dn ? 'd' : 'k';
  const col = (d: boolean) => (
    <div className="flex flex-col gap-1 p-2">
      {openSide === (d ? 'd' : 'k') && (
        <div className="flex justify-between gap-2 text-xs text-au-muted">
          <span>Boshlang‘ich qoldiq</span>
          <b className="tabular-nums">{fmtNum(Math.abs(line.openingPeriod))}</b>
        </div>
      )}
      {side(d).map((e) => (
        <div key={e.id} className="flex justify-between gap-2 text-xs">
          <span className="truncate">
            {e.entry_date.slice(8)}.{e.entry_date.slice(5, 7)} · {e.description} <em className="text-au-faint">({name(d ? e.credit : e.debit)})</em>
          </span>
          <b className="tabular-nums">{fmtNum(e.amount)}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>
          Hisob kartochkasi · {line.name}
        </h3>
        <small>shu oydagi harakatlar</small>
      </div>
      <div className="overflow-hidden rounded-xl border border-au-line">
        <div className="grid grid-cols-2 border-b border-au-line bg-au-card-2 text-center text-xs font-bold">
          <span className="p-1.5" title="Debet (Dt) — hisobning chap tomoni: aktiv va xarajat ko‘payadi, majburiyat va daromad kamayadi">Debet</span>
          <span className="border-l border-au-line p-1.5" title="Kredit (Kt) — hisobning o‘ng tomoni: majburiyat va daromad ko‘payadi, aktiv kamayadi">Kredit</span>
        </div>
        <div className="grid grid-cols-2">
          {col(true)}
          <div className="border-l border-au-line">{col(false)}</div>
        </div>
        <div className="grid grid-cols-2 border-t border-au-line text-xs">
          <span className="p-1.5">
            Aylanma: <b>{fmtNum(line.debit)}</b>
          </span>
          <span className="border-l border-au-line p-1.5">
            Aylanma: <b>{fmtNum(line.credit)}</b>
          </span>
        </div>
        <div className="border-t border-au-line p-2 text-right text-sm">
          Oxirgi qoldiq: <b>{fmtNum(Math.abs(line.closing))}</b>{' '}
          {line.closing === 0 ? '' : (line.closing > 0) === dn ? '(debet)' : '(kredit)'}
        </div>
      </div>
      {sorted.length > 0 && (
        <div className="mt-4">
          <Chart
            labels={['Boshi', ...sorted.map((e) => `${e.entry_date.slice(8)}.${e.entry_date.slice(5, 7)}`)]}
            fmt={fmtMln}
            height={170}
            series={[{ n: 'Qoldiq', c: '#17161a', v: [line.openingPeriod, ...run], kind: 'line' }]}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- FA · reports */
export function FaReports({ books, ym }: { books: Books; ym: string }) {
  // "Bu raqam nimadan iborat?" — the P&L line whose entries are open.
  const [drill, setDrill] = useState<string | null>(null);
  const s = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const cf = cashFlowStatement(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const q = ratios(s);
  const rec = reconcile(books.courses, s);
  const accName = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? c;
  const row = (n: string, v: number, cls = '', code?: string) => (
    <tr
      className={cn(cls, code && 'cursor-pointer hover:bg-au-card-2', code && drill === code && 'bg-au-accent-soft')}
      onClick={code ? () => setDrill(drill === code ? null : code) : undefined}
      title={code ? 'Bosing — qaysi yozuvlardan iborat' : undefined}
    >
      <td className="l">
        {n}
        {code && <span className="ml-1 text-[10px] text-au-muted">{drill === code ? '▾' : '▸'}</span>}
      </td>
      <td style={{ color: v < 0 ? 'var(--au-bad)' : undefined }}>{fmtNum(v)}</td>
    </tr>
  );
  const drillRows = drill
    ? books.entries
        .filter((e) => e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym) && (e.debit === drill || e.credit === drill))
        .sort((a, b) => b.amount - a.amount)
    : [];
  const grp = (n: string) => (
    <tr>
      <td className="l text-[11px] font-bold tracking-wide text-au-muted uppercase" colSpan={2}>
        {n}
      </td>
    </tr>
  );
  const R: [string, string, number | null, string, number, number | null][] = [
    ['Joriy likvidlik', 'Current ratio', q.current, '×', 2, 1.5],
    ['Tezkor likvidlik', 'Quick ratio', q.quick, '×', 2, 1],
    ['Sotuv rentabelligi', 'ROS', q.ros === null ? null : q.ros * 100, '%', 1, 10],
    ['Aktivlar rentabelligi', 'ROA (oylik)', q.roa === null ? null : q.roa * 100, '%', 1, 2],
    ['Kapital rentabelligi', 'ROE (oylik)', q.roe === null ? null : q.roe * 100, '%', 1, 3],
    ['Qarz / kapital', 'D/E', q.de, '×', 2, null],
  ];
  const empty = !books.entries.some((e) => e.entry_date <= monthEnd(ym)) && !Object.values(books.opening).some(Boolean);
  return (
    <div className="sx-grid">
      {empty && (
        <div className="sx-card s12">
          <div className="sx-empty">
            Hisobotlar kiritilgan raqamlardan tuziladi. «Kirim-chiqim» bo‘limida kirim va chiqimlarni yozing (yoki «Aylanma va qoldiqlar»da boshlang‘ich
            qoldiqlarni kiriting) — balans, foyda va pul oqimi shu yerda darhol paydo bo‘ladi.
          </div>
        </div>
      )}
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Buxgalteriya balansi</h3>
          <small>{monthEnd(ym).split('-').reverse().join('.')} holatiga · 1-shakl</small>
          <span className="sp" />
          <span className={cn('sx-pl', s.imbalance === 0 ? 'ok' : 'bad')}>
            {s.imbalance === 0 ? 'Aktiv = Passiv' : `Farq ${fmtNum(s.imbalance)}`}
          </span>
        </div>
        <table className="sx-tbl">
          <tbody>
            {grp('Aktivlar · I. Uzoq muddatli aktivlar')}
            {row('Asosiy vositalar (boshlang‘ich qiymat)', L['0100']?.closing ?? 0)}
            {row('Eskirish', -(L['0200']?.closing ?? 0))}
            {row('Asosiy vositalar (qoldiq qiymat)', s.fixedNet, 'sub')}
            {grp('II. Joriy aktivlar')}
            {row('Tovar-moddiy zaxiralar', s.inventory)}
            {row('Debitorlik qarzlari', s.receivables)}
            {row('Pul mablag‘lari', s.cash)}
            {row('Jami joriy aktivlar', s.currentAssets, 'sub')}
            {row('BALANS AKTIVI', s.assets, 'big')}
            {grp('Passivlar · I. O‘z mablag‘lari manbalari')}
            {row('Ustav kapitali', s.capital)}
            {row('Taqsimlanmagan foyda (o‘tgan davrlar)', s.retained - s.net)}
            {row('Hisobot davri sof foydasi (zarari)', s.net)}
            {row('Jami o‘z mablag‘lari', s.equity, 'sub')}
            {grp('II. Majburiyatlar')}
            {row('Yetkazib beruvchilarga qarz', s.payables)}
            {row('Olingan bo‘naklar', s.advances)}
            {row('Budjetga qarz', s.taxPayable)}
            {row('Ijtimoiy soliq bo‘yicha qarz', s.socialPayable)}
            {row('Mehnat haqi bo‘yicha qarz', s.wagesPayable)}
            {row('Jami majburiyatlar', s.liabilities, 'sub')}
            {row('BALANS PASSIVI', s.liabilities + s.equity, 'big')}
          </tbody>
        </table>
        {s.imbalance !== 0 && (
          <p className="sx-note">
            Farq odatda boshlang‘ich qoldiqlar muvozanatsizligidan kelib chiqadi — «Aylanma va qoldiqlar» → «Boshlang‘ich qoldiqlar»da Aktiv = Passiv bo‘lishini
            tekshiring.
          </p>
        )}
      </div>
      <div className="s6 flex flex-col gap-4">
        <div className="sx-card">
          <div className="sx-h">
            <h3>Moliyaviy natijalar to‘g‘risida hisobot</h3>
            <small>{ym} · 2-shakl</small>
          </div>
          <table className="sx-tbl">
            <tbody>
              {row("Sof tushum — ta'lim xizmatlari", s.revenue, '', '9030')}
              {row('Sotilgan xizmatlar tannarxi', -s.cogs, '', '9130')}
              {row('Yalpi foyda', s.gross, 'sub')}
              {row('Sotish xarajatlari', -s.selling, '', '9410')}
              {row("Ma'muriy xarajatlar", -s.admin, '', '9420')}
              {row('Boshqa operatsion xarajatlar', -s.other, '', '9430')}
              {row('Operatsion foyda', s.operating, 'sub')}
              {row('Soliq xarajatlari', -s.tax, '', '9810')}
              {row('SOF FOYDA (ZARAR)', s.net, 'big')}
            </tbody>
          </table>
          {drill && (
            <div className="mt-3 rounded-xl border border-au-line bg-au-card-2 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <b>{accName(drill)} — {drillRows.length} ta yozuv</b>
                <button className="sx-btn sm" onClick={() => setDrill(null)}>
                  Yopish
                </button>
              </div>
              {drillRows.length === 0 ? (
                <div className="text-xs text-au-muted">Bu oyda yozuv yo‘q.</div>
              ) : (
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
                  {drillRows.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="tabular-nums text-au-muted">{e.entry_date.slice(8, 10)}.{e.entry_date.slice(5, 7)}</span>
                      <span className="min-w-0 flex-1 truncate">{e.description}</span>
                      {e.source && <span className="sx-pl info">AUTO</span>}
                      <b className="tabular-nums">{fmtNum(e.debit === drill ? e.amount : -e.amount)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="sx-card">
          <div className="sx-h">
            <h3>Pul oqimlari to‘g‘risida hisobot</h3>
            <small>to‘g‘ridan-to‘g‘ri usul · {ym}</small>
            <span className="sp" />
            <span className={cn('sx-pl', Math.abs(cf.closing - s.cash) < 0.01 ? 'ok' : 'bad')}>
              {Math.abs(cf.closing - s.cash) < 0.01 ? 'Balans bilan mos' : 'Mos emas'}
            </span>
          </div>
          <table className="sx-tbl">
            <tbody>
              {row('Davr boshidagi pul', cf.opening)}
              {(
                [
                  ['op', 'Operatsion faoliyat'],
                  ['inv', 'Investitsiya faoliyati'],
                  ['fin', 'Moliyaviy faoliyat'],
                ] as const
              ).map(([k, n]) => (
                <Fragment key={k}>
                  {grp(n)}
                  {cf.lines
                    .filter((l) => l.cat === k)
                    .map((l) => (
                      <Fragment key={`${l.code}${l.amount > 0}`}>{row(`${l.amount >= 0 ? 'Kirim' : 'Chiqim'}: ${accName(l.code)}`, l.amount)}</Fragment>
                    ))}
                  {row('Sof oqim', cf[k], 'sub')}
                </Fragment>
              ))}
              {row('Davr oxiridagi pul', cf.closing, 'big')}
            </tbody>
          </table>
        </div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Moliyaviy koeffitsientlar</h3>
          <small>Ratio analysis</small>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {R.map(([n, en, v, u, d, norm]) => (
            <div key={en} className="rounded-xl border border-au-line bg-au-card-2 p-3">
              <div className="text-[11px] text-au-faint">{en}</div>
              <div className="text-xs font-semibold text-au-muted">{n}</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: v === null || norm === null ? undefined : v >= norm ? 'var(--au-ok)' : 'var(--au-bad)' }}>
                {v === null ? '—' : `${v.toFixed(d)}${u}`}
              </div>
              <div className="text-[11px] text-au-faint">{norm === null ? 'past = xavfsiz' : `me'yor ≥ ${norm}${u}`}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>MA → FA solishtirish</h3>
          <small>Reconciliation</small>
        </div>
        <p className="mb-2 text-xs text-au-muted">Nega boshqaruv foydasi va buxgalteriya foydasi farq qiladi:</p>
        <table className="sx-tbl">
          <tbody>
            {row('Boshqaruv hisobi sof foydasi', rec.ma, 'sub')}
            {rec.rows.map((r) => (
              <Fragment key={r.n}>{row(r.n, r.v)}</Fragment>
            ))}
            {row('Moliyaviy hisob sof foydasi', rec.fa, 'big')}
          </tbody>
        </table>
        <p className="sx-note">
          Boshqaruv foydasi = kurslar modeli qoplamasi (Kurslar va marja) − kiritilgan doimiy xarajatlar (marketing, ma’muriy, boshqa). Qolgan farq — model
          bilan jurnal o‘rtasidagi tushum/tannarx tafovuti va soliq.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- FA · tax/pay */
export function FaTax({ books, ym }: { books: Books; ym: string }) {
  const { run, pending } = useRun();
  const [t, setT] = useState<TaxSettings>(books.tax);
  const [rows, setRows] = useState<PayrollLine[] | null>(null);
  // Read-only fetch keyed on the month string (stable) — re-runs only when
  // the month changes, never on its own result.
  useEffect(() => {
    let live = true;
    getPayrollForMonthAction(ym).then((res) => {
      if (!live) return;
      if (res.error) toast.error(err(res.error));
      setRows(res.rows ?? []);
    });
    return () => {
      live = false;
      setRows(null);
    };
  }, [ym]);
  // Accountant's corrections to the accrued gross, per month (staffId → so'm).
  const [ovs, setOvs] = useState<Record<string, Record<string, number>>>({});
  const ov = ovs[ym] ?? {};
  const p = payrollTaxes((rows ?? []).map((r) => (r.staffId in ov ? { ...r, gross: ov[r.staffId] } : r)), t);
  const s = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const cmp = taxCompare(s.revenue, s.net + s.tax, t);
  const posted = books.entries.some((e) => e.source?.startsWith(`payroll:${ym}:`));
  const rate = (k: 'turnover' | 'pit' | 'social' | 'profit' | 'vat', n: string) => (
    <label>
      {n}
      <input className="sx-inp !w-[80px] text-right" type="number" min={0} max={100} step={0.5} placeholder="0" value={t[k] || ''} onChange={(e) => setT({ ...t, [k]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <div className="sx-grid">
      <div className={cn('sx-card sx-stat s4', t.regime === 'turn' && 'dark')}>
        <div className="l">Aylanmadan olinadigan soliq · {t.turnover}%</div>
        <div className="v">{fmtMln(cmp.turnover)}</div>
        <div className="d">{cmp.better === 'turn' ? 'Hozir arzonroq' : 'Qimmatroq'}</div>
      </div>
      <div className={cn('sx-card sx-stat s4', t.regime === 'gen' && 'dark')}>
        <div className="l">Umumiy rejim · foyda {t.profit}% + QQS {t.vat}%</div>
        <div className="v">{fmtMln(cmp.general)}</div>
        <div className="d">
          Foyda solig‘i {fmtMln(cmp.profit)} · QQS {t.vatExempt ? 'ozod' : fmtMln(cmp.vat)}
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Tanlangan rejim</h3>
          {cmp.better === t.regime ? <span className="sx-pl ok">Optimal</span> : <span className="sx-pl warn">{fmtMln(Math.abs(cmp.turnover - cmp.general))} tejash mumkin</span>}
        </div>
        <button
          className="sx-btn sm"
          disabled={pending || t.regime !== 'turn'}
          onClick={() => run(() => postTurnoverTaxAction(ym), `Aylanma soliq ${ym} jurnalga o‘tkazildi`)}
        >
          Aylanma soliqni jurnalga o‘tkazish
        </button>
        <p className="sx-note">Shu oy tushumidan hisoblanadi va soliq qarzi sifatida yoziladi. Qayta bossangiz yangilanadi.</p>
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Soliq stavkalari va sozlamalar</h3>
          <small>buxgalter tasdiqlasin</small>
        </div>
        <div className="sx-form">
          {rate('turnover', 'Aylanma %')}
          {rate('pit', 'JShDS %')}
          {rate('social', 'Ijtimoiy %')}
          {rate('profit', 'Foyda %')}
          {rate('vat', 'QQS %')}
          <label>
            Rejim
            <select className="sx-inp !w-[140px]" value={t.regime} onChange={(e) => setT({ ...t, regime: e.target.value as 'turn' | 'gen' })}>
              <option value="turn">Aylanma</option>
              <option value="gen">Umumiy</option>
            </select>
          </label>
          <label>
            Minimal pul zaxirasi
            <MoneyInput className="sx-inp !w-[150px] text-right" value={t.minCash} onValue={(v) => setT({ ...t, minCash: v ?? 0 })} />
          </label>
          <label className="!flex-row items-center gap-2 pb-2">
            <input type="checkbox" checked={t.vatExempt} onChange={(e) => setT({ ...t, vatExempt: e.target.checked })} />
            Ta’lim QQSdan ozod
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={() => run(() => saveTaxSettingsAction(t), 'Sozlamalar saqlandi')}>
            Saqlash
          </button>
        </div>
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Ish haqi vedomosti</h3>
          <small>{ym} · Moliya bo‘limidagi haqiqiy ish haqi · Hisoblangan summani tahrirlang — jami va soliqlar qayta hisoblanadi</small>
          <span className="sp" />
          {posted && <span className="sx-pl ok">Jurnalga o‘tkazilgan</span>}
          <button
            className="sx-btn primary sm"
            disabled={pending || !rows || rows.length === 0}
            onClick={() => run(() => postPayrollAction(ym, ov), `Ish haqi ${ym} jurnalga o‘tkazildi`)}
          >
            {posted ? 'Qayta o‘tkazish' : 'Jurnalga o‘tkazish'}
          </button>
        </div>
        {rows === null ? (
          <div className="sx-empty">Yuklanmoqda…</div>
        ) : rows.length === 0 ? (
          <div className="sx-empty">Bu oy uchun Moliya bo‘limida ish haqi belgilanmagan.</div>
        ) : (
          <div className="sx-tw">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Xodim</th>
                  <th className="l">Xarajat turi</th>
                  <th>Hisoblangan</th>
                  <th>JShDS {t.pit}%</th>
                  <th>Qo‘lga</th>
                  <th>Ijtimoiy {t.social}%</th>
                  <th>Ish beruvchiga jami</th>
                  <th>To‘langan</th>
                </tr>
              </thead>
              <tbody>
                {p.list.map((r, i) => (
                  <tr key={r.staffId} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                    <td className="l">
                      <b>{r.name}</b>
                    </td>
                    <td className="l">
                      {r.teaching ? 'Tannarx (dars)' : 'Ma’muriy'}
                    </td>
                    <td>
                      <MoneyInput
                        className={cn('sx-plain-inp !w-[120px]', r.staffId in ov && 'font-bold text-au-accent-text')}
                        value={r.gross}
                        onValue={(v) => setOvs({ ...ovs, [ym]: { ...ov, [r.staffId]: v ?? 0 } })}
                      />
                    </td>
                    <td>{fmtNum(r.pit)}</td>
                    <td>
                      <b>{fmtNum(r.net)}</b>
                    </td>
                    <td>{fmtNum(r.social)}</td>
                    <td>{fmtNum(r.gross + r.social)}</td>
                    <td>{fmtNum(r.paid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">Jami</td>
                  <td />
                  <td>{fmtNum(p.gross)}</td>
                  <td>{fmtNum(p.pit)}</td>
                  <td>{fmtNum(p.net)}</td>
                  <td>{fmtNum(p.social)}</td>
                  <td>{fmtNum(p.gross + p.social)}</td>
                  <td>{fmtNum(p.paid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="sx-note">
          Jurnalga avtomatik yoziladi: hisoblangan maosh, ushlangan JShDS, ijtimoiy soliq va to‘langan summa. O‘qituvchi, bosh
          o‘qituvchi va assistent maoshi — dars tannarxi, qolganlar — ma’muriy xarajat. Tahrirlangan summalar faqat jurnalga
          o‘tkazishda ishlatiladi (Moliya bo‘limidagi ish haqi o‘zgarmaydi).
        </p>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Soliq yuklamasi tarkibi</h3>
          <small>oylik · {t.regime === 'turn' ? 'aylanma rejim' : 'umumiy rejim'}</small>
        </div>
        <Chart
          labels={['Aylanma soliq', 'JShDS', 'Ijtimoiy soliq', 'Foyda solig‘i', 'QQS']}
          fmt={fmtMln}
          height={200}
          series={[
            {
              n: 'Summa',
              c: '#ff9f1c',
              v: [t.regime === 'turn' ? cmp.turnover : 0, p.pit, p.social, t.regime === 'gen' ? cmp.profit : 0, t.regime === 'gen' ? cmp.vat : 0],
            },
          ]}
        />
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Soliq kalendari</h3>
          <small>buxgalter tasdiqlasin</small>
        </div>
        <div className="flex flex-col gap-2">
          {taxCalendar(ym, { pit: p.pit, social: p.social, turnover: t.regime === 'turn' ? cmp.turnover : 0 }).map((c) => (
            <div key={c.n} className="flex items-center gap-3 text-sm">
              <span className="sx-pl info tabular-nums">{c.date.split('-').reverse().join('.')}</span>
              <span className="flex-1">{c.n}</span>
              <b className="tabular-nums">{c.amount === null ? 'hisobot' : c.amount ? fmtMln(c.amount) : '—'}</b>
            </div>
          ))}
        </div>
        <p className="sx-note">Muddat va stavkalarni buxgalter hamda soliq.uz bilan tasdiqlang.</p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- FA · assets */
export function FaAssets({ books, ym, today }: { books: Books; ym: string; today: string }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ name: '', category: '', cost: null as number | null, acquired: today, lifeYears: '3', journal: true });
  const rows = books.assets.map((a) => ({ a, d: depreciation(a, ym) }));
  // Balance-sheet totals only for assets still on the books at month end; the
  // month's charge also counts an asset disposed during that month.
  const tot = {
    ...rows.filter((r) => assetOnBooks(r.a, ym)).reduce((s, r) => ({ cost: s.cost + r.a.cost, acc: s.acc + r.d.accumulated, net: s.net + r.d.net }), { cost: 0, acc: 0, net: 0 }),
    ch: rows.reduce((s, r) => s + r.d.charge, 0),
  };
  const posted = books.entries.find((e) => e.source === `depr:${ym}`);
  const submit = () => {
    const cost = f.cost ?? 0;
    const life = Number(f.lifeYears);
    if (!f.name.trim() || !(cost > 0) || !(life >= 1)) return toast.error("Nomi, qiymati va muddatini kiriting");
    run(() => addAssetAction({ name: f.name, category: f.category, cost, acquired: f.acquired, lifeYears: life, journal: f.journal }), "Asosiy vosita qo'shildi", () =>
      setF({ ...f, name: '', category: '', cost: null }),
    );
  };
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat s3">
        <div className="l">Boshlang‘ich qiymat</div>
        <div className="v">{fmtMln(tot.cost)}</div>
        <div className="d">{rows.filter((r) => assetOnBooks(r.a, ym)).length} ta obyekt</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Jamg‘arilgan eskirish</div>
        <div className="v">{fmtMln(tot.acc)}</div>
        <div className="d">{tot.cost ? pct(tot.acc / tot.cost) : '—'} eskirgan</div>
      </div>
      <div className="sx-card sx-stat dark s3">
        <div className="l">Qoldiq qiymat · NBV</div>
        <div className="v">{fmtMln(tot.net)}</div>
        <div className="d">balansdagi qiymat</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Oylik amortizatsiya · {ym}</div>
        <div className="v">{fmtMln(tot.ch)}</div>
        <div className="d">
          <button
            className="sx-btn sm mt-1"
            disabled={pending}
            onClick={() => run(() => postDepreciationAction(ym), `Eskirish ${ym} jurnalga o‘tkazildi`)}
          >
            {posted ? 'Qayta o‘tkazish' : 'Jurnalga o‘tkazish'}
          </button>
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Yangi obyekt</h3>
          <small>to‘g‘ri chiziqli usul · keyingi oydan boshlanadi</small>
        </div>
        <div className="sx-form">
          <label className="min-w-[200px] flex-1">
            Nomi
            <input className="sx-inp" maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            Toifa
            <input className="sx-inp !w-[140px]" maxLength={80} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </label>
          <label>
            Qiymat, so‘m
            <MoneyInput className="sx-inp !w-[150px] text-right" value={f.cost} onValue={(v) => setF({ ...f, cost: v })} />
          </label>
          <label>
            Sana
            <input type="date" className="sx-inp" value={f.acquired} onChange={(e) => e.target.value && setF({ ...f, acquired: e.target.value })} />
          </label>
          <label>
            Muddat, yil
            <input className="sx-inp !w-[80px] text-right" type="number" min={1} max={50} value={f.lifeYears} onChange={(e) => setF({ ...f, lifeYears: e.target.value })} />
          </label>
          <label className="!flex-row items-center gap-2 pb-2">
            <input type="checkbox" checked={f.journal} onChange={(e) => setF({ ...f, journal: e.target.checked })} />
            Xaridni pul chiqimi sifatida yozish (bankdan)
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={submit}>
            <Plus className="size-4" /> Qo‘shish
          </button>
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Asosiy vositalar reyestri</h3>
          <small>inventar kartochkalari</small>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Vosita</th>
                <th className="l">Toifa</th>
                <th className="l">Kirim sanasi</th>
                <th>Qiymat</th>
                <th>Muddat</th>
                <th>Oylik eskirish</th>
                <th>Jamg‘arilgan</th>
                <th>Qoldiq</th>
                <th>Eskirish darajasi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="l">
                    <div className="sx-empty">Asosiy vositalar kiritilmagan — yuqoridagi formadan nomi, qiymati va muddatini kiriting.</div>
                  </td>
                </tr>
              )}
              {rows.map(({ a, d }, i) => (
                <tr key={a.id} style={{ animationDelay: `${i * 25}ms` }}>
                  <td className="l">
                    <b>{a.name}</b>
                  </td>
                  <td className="l">{a.category}</td>
                  <td className="l">{a.acquired.split('-').reverse().join('.')}</td>
                  <td>{fmtNum(a.cost)}</td>
                  <td>{a.life_years} yil</td>
                  <td>{fmtNum(d.monthly)}</td>
                  <td>{fmtNum(d.accumulated)}</td>
                  <td>{fmtNum(d.net)}</td>
                  <td>
                    <div className="sx-hbar !h-[6px] w-[90px]">
                      <i
                        title={`${Math.round((d.monthsUsed / (a.life_years * 12)) * 100)}%`}
                        style={{
                          width: `${(d.monthsUsed / (a.life_years * 12)) * 100}%`,
                          background: d.monthsUsed / (a.life_years * 12) > 0.8 ? 'var(--au-bad)' : d.monthsUsed / (a.life_years * 12) > 0.5 ? '#ff9f1c' : 'var(--au-ink)',
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {a.disposed ? (
                        <>
                          <span className="sx-pl mute whitespace-nowrap">Chiqarilgan {a.disposed.split('-').reverse().join('.')}</span>
                          <button
                            className="sx-btn sm"
                            disabled={pending}
                            onClick={() => run(() => disposeAssetAction({ id: a.id, date: null }), `«${a.name}» qayta tiklandi`)}
                          >
                            Qaytarish
                          </button>
                        </>
                      ) : (
                        <button
                          className="sx-btn sm whitespace-nowrap"
                          disabled={pending}
                          title="Sotilgan / yaroqsiz — eskirish to‘xtaydi, qoldiq qiymati boshqa xarajatga yoziladi"
                          onClick={() => {
                            const d = window.prompt(`«${a.name}» qaysi sanada hisobdan chiqarilsin? (YYYY-MM-DD)`, today);
                            if (d == null) return;
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trim()) || d.trim() < a.acquired) return toast.error("Sana noto'g'ri (xarid sanasidan oldin bo'lmasin)");
                            run(() => disposeAssetAction({ id: a.id, date: d.trim() }), `«${a.name}» hisobdan chiqarildi`);
                          }}
                        >
                          Chiqarish
                        </button>
                      )}
                      <button
                        className="sx-btn sm text-au-bad"
                        disabled={pending}
                        onClick={async () => (await ask(`«${a.name}» butunlay o'chirilsinmi? Xarid va eskirish yozuvlari ham qayta hisoblanadi.`)) && run(() => deleteAssetAction(a.id), "Vosita o'chirildi")}
                        aria-label="O'chirish"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {books.assets.length > 0 && <NbvForecast books={books} ym={ym} />}
    </div>
  );
}

/** Net book value by category, 12 months back to 24 ahead (quarterly). */
function NbvForecast({ books, ym }: { books: Books; ym: string }) {
  const months = Array.from({ length: 13 }, (_, i) => addMonths(ym, -12 + i * 3));
  const series = nbvByCategory(books.assets, months);
  const pal = ['#2477c9', '#ff9f1c', '#0ea5a4', '#7a5af8', '#e8567a', '#139a52'];
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Qoldiq qiymat prognozi</h3>
        <small>NBV · toifalar bo‘yicha · har chorak</small>
      </div>
      <Chart
        labels={months.map((m) => `${m.slice(5)}.${m.slice(2, 4)}`)}
        fmt={fmtMln}
        height={230}
        series={series.map((x, i) => ({ n: x.category, c: pal[i % pal.length], v: x.values, kind: 'line' as const }))}
      />
    </div>
  );
}
