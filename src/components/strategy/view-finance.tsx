'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  addMonths,
  courseEconomics,
  fmtMln,
  monthEnd,
  monthStart,
  monthlySeries,
  statements,
  type Account,
  type Course,
  type Entry,
  type TaxSettings,
} from '@/lib/accounting';
import {
  cacStatus,
  debtSummary,
  finMetrics,
  marginHeat,
  monthInputs,
  shiftLoad,
  waterfall,
  type FinInputs,
  type FinMetrics,
} from '@/lib/strategy-finance';
import { MONF } from '@/lib/strategy';
import { Chart, HBars } from './charts';
import { DebtorsModal, FinEditor } from './fin-parts';
import './fin.css';

export type BooksLite = {
  accounts: Account[];
  opening: Record<string, number>;
  entries: Entry[];
  courses: Course[];
  tax: TaxSettings;
};

const monthName = (ym: string) => `${MONF[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const mon3 = (ym: string) => `${MONF[+ym.slice(5, 7) - 1].slice(0, 3)} ${ym.slice(2, 4)}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
/** Percent value (already ×100) or a dash. */
export const pc = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`;
export const ming = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : `${v < 0 ? '−' : ''}${Math.round(Math.abs(v) / 1e3).toLocaleString('ru-RU').replace(/\s/g, ' ')} ming`;
const n0 = (v: number | null) => (v === null || !Number.isFinite(v) ? NaN : v);

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button className="sx-chipb" onClick={() => onChange(addMonths(value, -1))} aria-label="Oldingi oy">
        ‹
      </button>
      <input type="month" className="sx-inp !h-[30px] !w-[150px]" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button className="sx-chipb" onClick={() => onChange(addMonths(value, 1))} aria-label="Keyingi oy">
        ›
      </button>
    </div>
  );
}

/** Card header: number badge, title, English term, formula hint (ƒ). */
function MH({ n, t, en, fx, children }: { n?: number; t: string; en?: string; fx?: string; children?: React.ReactNode }) {
  return (
    <div className="fn-mh">
      {n !== undefined && <span className="n">{n}</span>}
      <span className="t">{t}</span>
      {en && <span className="en">{en}</span>}
      {children}
      {fx && (
        <span className="fx" title={`Formula: ${fx}`} aria-label={`Formula: ${fx}`}>
          ƒ
        </span>
      )}
    </div>
  );
}

/** 12 months of metrics ending at `ym`: money from the ledger, head-counts
 * from strategy_fin_months (current month: course tariffs as fallback). */
function useFinSeries(books: BooksLite, fin: FinInputs, ym: string, currentYm: string) {
  return useMemo(() => {
    const S = monthlySeries(books.accounts, books.opening, books.entries, ym, 12);
    return S.map((s) => {
      const inp = monthInputs(fin, books.courses, s.ym, currentYm);
      const m = finMetrics(s, {
        students: inp.students,
        newStudents: inp.newStudents,
        capacity: inp.capacity,
        courses: s.ym === currentYm ? books.courses : undefined,
      });
      return { ...m, ym: s.ym, lb: mon3(s.ym), rec: s.receivables, cash: s.cash, tax: s.tax, net: s.net, cur: s.ym === currentYm, inp };
    });
  }, [books, fin, ym, currentYm]);
}

function Spark({ H }: { H: { lb: string; npm: number | null; NP: number }[] }) {
  const [hov, setHov] = useState<number | null>(null);
  const W = 420;
  const Hh = 90;
  const vals = H.map((h) => h.npm ?? 0);
  const mn = Math.min(0, ...vals) - 2;
  const mx = Math.max(0, ...vals) + 2;
  const sx = (i: number) => 6 + (i / Math.max(1, vals.length - 1)) * (W - 12);
  const sy = (v: number) => 4 + (1 - (v - mn) / (mx - mn)) * (Hh - 18);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  return (
    <div className="fn-spark" onMouseLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${Hh}`} width="100%">
        <line x1="0" x2={W} y1={sy(0)} y2={sy(0)} className="zero" />
        <path d={`${line} L${sx(vals.length - 1)} ${Hh - 14} L${sx(0)} ${Hh - 14} Z`} className="area" />
        <path d={line} className="ln" />
        {vals.map((v, i) => (
          <circle key={i} cx={sx(i)} cy={sy(v)} r={i === vals.length - 1 ? 4 : 2.2} className={v < 0 ? 'neg' : i === vals.length - 1 ? 'last' : ''} />
        ))}
        {H.map((h, i) =>
          i % 2 === 1 || i === H.length - 1 ? (
            <text key={i} x={sx(i)} y={Hh - 2} textAnchor="middle">
              {h.lb.split(' ')[0]}
            </text>
          ) : null,
        )}
        {vals.map((_, i) => (
          <rect key={`h${i}`} x={sx(i) - W / vals.length / 2} y={0} width={W / vals.length} height={Hh} fill="transparent" onMouseEnter={() => setHov(i)} />
        ))}
      </svg>
      {hov !== null && (
        <div className="fn-sparktip">
          <b>{H[hov].lb}</b> · sof marja {pc(H[hov].npm)} · {fmtMln(H[hov].NP)}
        </div>
      )}
    </div>
  );
}

export function FinanceView({ books, fin, today, onGo }: { books: BooksLite; fin: FinInputs; today: string; onGo: () => void }) {
  const currentYm = today.slice(0, 7);
  const [ym, setYm] = useState(currentYm);
  const [edit, setEdit] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);
  const { accounts, opening, entries, courses } = books;
  const s = useMemo(() => statements(accounts, opening, entries, monthStart(ym), monthEnd(ym)), [accounts, opening, entries, ym]);
  const H = useFinSeries(books, fin, ym, currentYm);
  const M = H[H.length - 1];
  const prev = H[H.length - 2];
  const inp = M.inp;
  const debts = useMemo(() => debtSummary(fin.debtors, today), [fin.debtors, today]);
  const target = fin.settings.target;
  const expenses = s.cogs + s.selling + s.admin + s.other + s.tax;
  const runway = expenses > 0 ? s.cash / expenses : null;

  return (
    <div className="fn">
      <div className="fn-bar">
        <MonthPicker value={ym} onChange={setYm} />
        <span className="fn-live">
          <i />
          {ym === currentYm ? 'Jonli hisob' : monthName(ym)}
        </span>
        <span className="flex-1" />
        <button className="sx-btn sm" onClick={() => setEdit((v) => !v)} aria-expanded={edit}>
          {edit ? 'Kiritishni yopish' : 'Ma’lumotlarni kiritish'}
        </button>
        <button className="sx-btn sm" onClick={() => setDebtOpen(true)}>
          Qarzdorlar <span className="fn-cnt">{debts.count}</span>
        </button>
        <button className="sx-btn primary sm" onClick={onGo}>
          12 oylik tahlil →
        </button>
      </div>

      {edit && <FinEditor key={ym} books={books} fin={fin} ym={ym} inp={inp} fixed={{ selling: s.selling, admin: s.admin, other: s.other }} />}

      <div className="sx-grid">
        <NetCard M={M} prev={prev} H={H} />
        <DebtCard d={debts} ledger={s.receivables} R={M.R} onOpen={() => setDebtOpen(true)} />
        <CacCard M={M} H={H} newS={inp.newStudents} newFromLeads={inp.newFromLeads} />
        <BreakEvenCard M={M} paid={inp.paid} />
        <CapacityCard M={M} fin={fin} />
        <div className="sx-card s7">
          <MH n={1} t="Yalpi marja · kurslar kesimida" en="Gross profit margin" fx="((Tushum − O'qituvchilar ulushi va darsliklar) / Tushum) × 100" />
          <div className="fn-gm">
            <b>{pc(M.gm)}</b>
            <span>
              umumiy yalpi marja (jurnal) · yalpi foyda {fmtMln(M.GP)} so‘m · maqsad {target}%
            </span>
          </div>
          {courses.length === 0 ? (
            <div className="sx-empty">Kurslar yo‘q — «Ma’lumotlarni kiritish» yoki Hisob-kitob → Xarajat & marja</div>
          ) : (
            <Chart
              labels={courses.map((c) => c.name)}
              height={230}
              fmt={(v) => `${Math.round(v)}%`}
              series={[
                { n: 'Yalpi marja', c: 'var(--au-ink)', v: courses.map((c) => courseEconomics(c).margin * 100) },
                { n: `Maqsad ${target}%`, c: 'var(--au-accent)', v: courses.map(() => target), kind: 'line', dash: true },
              ]}
            />
          )}
          {courses.length > 0 && (
            <div className="fn-gmleg">
              {courses.map((c) => {
                const m = courseEconomics(c).margin * 100;
                return (
                  <span key={c.id} className={m >= target ? 'pos' : 'neg'}>
                    {c.name}: {m >= target ? 'Maqsaddan yuqori' : 'Maqsaddan past'} ({pc(m, 0)})
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <PlCard s={s} />
        <div className="sx-card sx-stat s4">
          <div className="l">Pul qoldig‘i (5010 + 5110)</div>
          <div className="v" style={{ color: s.cash < books.tax.minCash ? 'var(--au-bad)' : undefined }}>
            {fmtMln(s.cash)}
          </div>
          <div className="d">{runway !== null ? `≈ ${runway.toFixed(1)} oylik xarajatga yetadi` : 'Bu oy xarajat yozilmagan'}</div>
          <Link href="/accounting" className="sx-btn sm mt-3">
            Hisob-kitobga o‘tish →
          </Link>
        </div>
        <div className="sx-card s8">
          <div className="sx-h">
            <h3>Xarajatlar tarkibi</h3>
            <small>{monthName(ym)}</small>
          </div>
          {expenses === 0 ? (
            <div className="sx-empty">Bu oy xarajat yozilmagan</div>
          ) : (
            <HBars
              fmt={fmtMln}
              rows={[
                { n: "Tannarx (o'qituvchi, darslik)", v: s.cogs, c: '#2477c9' },
                { n: 'Marketing', v: s.selling, c: '#e8567a' },
                { n: "Ma'muriy", v: s.admin, c: '#7a5af8' },
                { n: 'Boshqa operatsion', v: s.other, c: '#0ea5a4' },
                { n: 'Soliq', v: s.tax, c: '#c7322b' },
              ].map((r) => ({ ...r, sub: s.revenue ? pct(r.v / s.revenue) + ' tushumdan' : undefined }))}
            />
          )}
        </div>
      </div>
      {debtOpen && <DebtorsModal fin={fin} courses={courses} today={today} onClose={() => setDebtOpen(false)} />}
    </div>
  );
}

type Row = FinMetrics & { lb: string; ym: string; rec: number; cur: boolean };

function NetCard({ M, prev, H }: { M: Row; prev: Row; H: Row[] }) {
  const d = M.npm !== null && prev.npm !== null ? M.npm - prev.npm : null;
  return (
    <div className={`sx-card sx-stat dark s5 fn-np ${M.NP < 0 ? 'neg' : ''}`}>
      <MH n={2} t="Sof biznes foydasi" en="Operating margin" fx="((Yalpi foyda − Marketing − Ma'muriy − Boshqa operatsion) / Tushum) × 100" />
      <div className="fn-npmain">
        <div className="v">{pc(M.npm)}</div>
        <div>
          {d !== null ? (
            <span className={`fn-trend ${d >= 0 ? 'up' : 'dn'}`}>
              {d >= 0 ? '▲ +' : '▼ −'}
              {Math.abs(d).toFixed(1)} p.p.
            </span>
          ) : (
            <span className="fn-trend">—</span>
          )}
          <div className="d">o‘tgan oyga nisbatan ({pc(prev.npm)})</div>
        </div>
      </div>
      <div className="d">
        Sof foyda: <b>{fmtMln(M.NP)} so‘m</b>
        {M.npm !== null && (
          <>
            {' '}
            · tushumdan qolgan har 100 so‘mdan <b>{Math.round(M.npm)} so‘m</b>
          </>
        )}
      </div>
      <Spark H={H} />
      <div className="fn-nprow">
        <div>
          Tushum<b>{fmtMln(M.R)}</b>
        </div>
        <div>
          Yalpi foyda<b>{fmtMln(M.GP)}</b>
        </div>
        <div>
          Doimiy xarajat<b>{fmtMln(M.fixed)}</b>
        </div>
      </div>
    </div>
  );
}

function DebtCard({ d, ledger, R, onOpen }: { d: ReturnType<typeof debtSummary>; ledger: number; R: number; onOpen: () => void }) {
  return (
    <div className="sx-card s4">
      <MH n={5} t="Qarzdorlik" en="Receivables" fx="To'lov muddatidan o'tib ketgan jami kutilayotgan tushum">
        {d.count > 0 && <span className="fn-al">Muddati o‘tgan</span>}
      </MH>
      <div className="fn-big">
        {fmtMln(d.total)}
        <small>so‘m</small>
      </div>
      <div className="fn-sub">
        <b>{d.count} o‘quvchi</b> · o‘rtacha {d.avgDays} kun kechikish · tushumning <b>{pc(R ? (d.total / R) * 100 : null)}</b>
      </div>
      <div className="fn-age" role="img" aria-label="Qarzdorlik muddatlari">
        {d.aging.map((a) => (
          <div key={a.k} style={{ flex: a.sum || 0.0001, background: a.c }} title={`${a.label}: ${a.n} o‘quvchi · ${fmtMln(a.sum)}`} />
        ))}
      </div>
      <div className="fn-leg">
        {d.aging.map((a) => (
          <span key={a.k}>
            <i style={{ background: a.c }} />
            {a.label} · {fmtMln(a.sum)}
          </span>
        ))}
      </div>
      <div className="fn-top">
        {d.top.length === 0 && (
          <div className="r">
            <span>Qarzdor yo‘q</span>
          </div>
        )}
        {d.top.map((x) => (
          <div key={x.id} className="r">
            <span>{x.name}</span>
            <b>{ming(x.amount)}</b>
            <em>{x.days} kun</em>
          </div>
        ))}
      </div>
      <div className="fn-note">Jurnal bo‘yicha debitorlik (4010): {fmtMln(ledger)}</div>
      <button className="fn-link" onClick={onOpen}>
        Qarzdorlar ro‘yxati ({d.count}) →
      </button>
    </div>
  );
}

function CacCard({ M, H, newS, newFromLeads }: { M: Row; H: Row[]; newS: number | null; newFromLeads: boolean }) {
  const st = cacStatus(M.cacRatio);
  const mx = Math.max(M.cac ?? 0, M.fee ?? 0) * 1.08 || 1;
  const last = H.slice(-6);
  const hm = Math.max(1, ...last.map((x) => Math.max(x.cac ?? 0, x.fee ?? 0)));
  const r = M.cacRatio;
  return (
    <div className="sx-card s3">
      <MH n={6} t="1 ta o‘quvchi narxi" en="CAC" fx="Oylik marketing xarajati (9410) / Shu oy kelgan yangi o'quvchilar soni" />
      <div className="fn-big">
        {M.cac === null ? '—' : ming(M.cac)}
        <small>so‘m</small>
      </div>
      <div className="fn-cmp">
        <div className="r">
          <span>CAC</span>
          <div className="tr">
            <i className={st} style={{ width: `${((M.cac ?? 0) / mx) * 100}%` }} />
          </div>
          <b>{ming(M.cac)}</b>
        </div>
        <div className="r">
          <span>Oylik to‘lov</span>
          <div className="tr">
            <i style={{ width: `${((M.fee ?? 0) / mx) * 100}%` }} />
          </div>
          <b>{ming(M.fee)}</b>
        </div>
      </div>
      <span className={`fn-stat ${st}`}>
        <i />
        {r === null
          ? 'Yangi o‘quvchi yo‘q'
          : st === 'ok'
            ? `To‘lovning ${Math.round(r * 100)}% · me’yorda`
            : st === 'warn'
              ? `${Math.round(r * 100)}% · chegaraga yaqin`
              : `To‘lovdan ${Math.round((r - 1) * 100)}% qimmat!`}
      </span>
      <div className="fn-mini">
        <div>
          Qoplanish<b>{M.cacPayback === null ? '—' : `${M.cacPayback.toFixed(1)} oy`}</b>
        </div>
        <div>
          Yangi o‘quvchi<b>{newS === null ? '—' : `${newS} ta`}</b>
        </div>
      </div>
      <div className="fn-note">{newFromLeads ? 'Yangi o‘quvchilar — Operatsiya HQ lidlaridan (enrolled)' : 'Yangi o‘quvchilar — qo‘lda kiritilgan'}</div>
      <div className="fn-cach">
        <div className="hl">
          <span>So‘nggi 6 oy · CAC</span>
          <span>
            <i />
            oylik to‘lov
          </span>
        </div>
        <div className="hb">
          {last.map((h) => (
            <div key={h.ym} title={`${h.lb}: ${ming(h.cac)}`}>
              {h.fee !== null && <s style={{ bottom: `${(h.fee / hm) * 100}%` }} />}
              <i className={h.cur ? 'cur' : ''} style={{ height: `${((h.cac ?? 0) / hm) * 100}%` }} />
              <em>{h.lb.split(' ')[0]}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BreakEvenCard({ M, paid }: { M: Row; paid: number }) {
  const bep = M.bep;
  const N = M.N ?? 0;
  const need = bep === null ? null : Math.max(0, bep - paid);
  const scale = Math.max(N, bep ?? 0, paid) * 1.06 || 1;
  const P = (v: number) => Math.min(100, (v / scale) * 100);
  return (
    <div className="sx-card s7">
      <MH
        n={3}
        t="Zararsizlik nuqtasi"
        en="Break-even · o‘quvchi sonida"
        fx="Doimiy xarajatlar / (1 o'quvchining oylik to'lovi − 1 o'quvchiga ketadigan to'g'ridan-to'g'ri xarajat)"
      />
      <div className="fn-betop">
        <div>
          <div className="fn-bev">
            {paid}
            <span> / {bep === null ? '∞' : bep}</span>
          </div>
          <div className="fn-sub">bu oy to‘lov qilgan / kerakli o‘quvchi</div>
        </div>
        {M.fee === null ? (
          <div className="fn-msg need">O‘quvchilar soni yoki kurs narxlari kiritilmagan — «Ma’lumotlarni kiritish».</div>
        ) : bep === null ? (
          <div className="fn-msg need">1 o‘quvchidan marja manfiy — to‘lov to‘g‘ridan-to‘g‘ri xarajatni yopmayapti.</div>
        ) : need! > 0 ? (
          <div className="fn-msg need">
            Xarajatlarni yopish uchun yana <b>{need} ta</b> o‘quvchi to‘lovi kerak
          </div>
        ) : (
          <div className="fn-msg done">
            Zararsizlik nuqtasi o‘tildi — <b>+{paid - bep}</b> o‘quvchi to‘lovi sof foyda keltirmoqda
          </div>
        )}
      </div>
      <div className="fn-track">
        {bep !== null && need! > 0 && <div className="gap" style={{ left: `${P(paid)}%`, width: `${P(bep) - P(paid)}%` }} />}
        <div className={`fill ${bep !== null && need === 0 ? 'ok' : ''}`} style={{ width: `${P(paid)}%` }} />
        {bep !== null && (
          <div className="mk" style={{ left: `${P(bep)}%` }}>
            <span className={P(bep) > 82 ? 'r' : ''}>Zararsizlik · {bep}</span>
          </div>
        )}
        {M.N !== null && (
          <div className="mk en" style={{ left: `${P(N)}%` }}>
            <span className={`${P(N) > 82 ? 'r' : ''} ${bep !== null && Math.abs(P(N) - P(bep)) < 22 ? 'b' : ''}`}>Jami o‘quvchi · {N}</span>
          </div>
        )}
      </div>
      <div className="fn-leg">
        <span>
          <i style={{ background: 'var(--au-ink)' }} />
          To‘lov qilgan
        </span>
        {need !== null && need > 0 ? (
          <span>
            <i style={{ background: 'var(--au-accent)' }} />
            Yetishmayotgan to‘lovlar
          </span>
        ) : (
          <span>
            <i style={{ background: 'var(--au-ok)' }} />
            Foyda zonasi
          </span>
        )}
        <span>
          <i className="hatch" />
          Hali to‘lamagan
        </span>
      </div>
      <div className="fn-kv">
        <div>
          Doimiy xarajatlar<b>{fmtMln(M.fixed)}</b>
        </div>
        <div>
          O‘rtacha oylik to‘lov<b>{ming(M.fee)}</b>
        </div>
        <div>
          To‘g‘ridan-to‘g‘ri / o‘q.<b>{ming(M.dcs)}</b>
        </div>
        <div>
          Xavfsizlik zonasi<b className={(M.safety ?? 0) >= 0 ? 'pos' : 'neg'}>{pc(M.safety, 0)}</b>
        </div>
      </div>
    </div>
  );
}

function CapacityCard({ M, fin }: { M: Row; fin: FinInputs }) {
  const u = Math.min(100, M.util ?? 0);
  const C = 2 * Math.PI * 66;
  const st = fin.settings;
  const shs = M.N !== null && st.shifts.length ? shiftLoad(M.N, st) : [];
  return (
    <div className="sx-card s5">
      <MH n={4} t="Xonalar bandligi" en="Capacity utilization" fx="(Hozirgi o'quvchilar soni / O'quv markazining maksimal sig'imi) × 100" />
      {M.capacity === 0 ? (
        <div className="sx-empty">Sig‘im kiritilmagan — «Ma’lumotlarni kiritish» → Sig‘im va oy holati</div>
      ) : (
        <div className="fn-cap">
          <div className="dn">
            <svg viewBox="0 0 170 170">
              <circle cx="85" cy="85" r="66" className="bg" />
              <circle cx="85" cy="85" r="66" className={`arc ${(M.util ?? 0) >= 90 ? 'hot' : ''}`} strokeDasharray={`${(u / 100) * C} ${C}`} />
            </svg>
            <div className="ctr">
              <b>{pc(M.util, 0)}</b>
              <small>{M.free === null ? '—' : M.free >= 0 ? `${M.free} ta bo‘sh joy` : `${-M.free} ta ortiqcha!`}</small>
            </div>
          </div>
          <div className="sh">
            <div className="cap-l">Smenalar bo‘yicha</div>
            {shs.length === 0 && <div className="fn-note">Smenalar kiritilmagan</div>}
            {shs.map((s) => (
              <div key={s.t} className="r" title={`${s.t} smena: ${s.n} / ${s.cap} o‘quvchi · bo‘sh ${Math.max(0, s.cap - s.n)}`}>
                <span>{s.t}</span>
                <div className="tr">
                  <i className={s.pct >= 90 ? 'hot' : ''} style={{ width: `${Math.min(100, s.pct)}%` }} />
                </div>
                <b>
                  {Math.round(s.pct)}%{s.pct >= 90 && <em>to‘la</em>}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="fn-capf">
        <span>
          Sig‘im:{' '}
          <b>
            {st.rooms} xona × {st.seats} o‘rin × {st.shifts.length} smena = {M.capacity}
          </b>
        </span>
        <span>
          Band: <b>{M.N ?? '—'}</b>
        </span>
      </div>
    </div>
  );
}

function PlCard({ s }: { s: ReturnType<typeof statements> }) {
  const op = s.gross - s.selling - s.admin - s.other;
  const rows = waterfall([
    { n: 'Tushum', v: s.revenue, total: true },
    { n: 'To‘g‘ridan-to‘g‘ri xarajat', v: -s.cogs },
    { n: 'Yalpi foyda', v: s.gross, total: true },
    { n: 'Marketing', v: -s.selling },
    { n: 'Ma’muriy', v: -s.admin },
    { n: 'Boshqa operatsion', v: -s.other },
    { n: 'Operatsion foyda', v: op, total: true },
    { n: 'Soliq', v: -s.tax },
    { n: 'Sof foyda', v: s.net, total: true },
  ]);
  const mx = Math.max(s.revenue, 1, ...rows.map((r) => r.to));
  const mn = Math.min(0, ...rows.map((r) => r.from));
  const X = (v: number) => ((v - mn) / (mx - mn)) * 100;
  return (
    <div className="sx-card s5">
      <MH t="Tushumdan sof foydagacha" en="P&L · mln so‘m" />
      <div className="fn-wf">
        {rows.map((r, i) => {
          const net = i === rows.length - 1;
          const cls = !r.total ? 'cost' : net ? (r.v >= 0 ? 'pos' : 'neg') : r.n === 'Tushum' ? 'tot' : 'sub';
          return (
            <div key={r.n} className={`r ${r.total ? 'tot' : ''}`} title={`${r.n}: ${fmtMln(r.v)} · tushumga nisbatan ${pc(s.revenue ? (Math.abs(r.v) / s.revenue) * 100 : null)}`}>
              <span>{r.n}</span>
              <div className="tr">
                <i className={cls} style={{ left: `${X(r.from)}%`, width: `${Math.max(0.4, X(r.to) - X(r.from))}%` }} />
              </div>
              <b className={net ? (r.v >= 0 ? 'pos' : 'neg') : ''}>{fmtMln(r.v)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Tahlil */

export function AnalyticsView({ books, fin, today }: { books: BooksLite; fin: FinInputs; today: string }) {
  const ym = today.slice(0, 7);
  const H = useFinSeries(books, fin, ym, ym);
  const labels = H.map((h) => h.lb);
  const cur = H[H.length - 1];
  const prev = H[H.length - 2];
  const sum = (f: (h: (typeof H)[number]) => number) => H.reduce((a, h) => a + f(h), 0);
  const yR = sum((h) => h.R);
  const yNP = sum((h) => h.NP);
  const yD = sum((h) => h.D);
  const yFixed = sum((h) => h.fixed);
  const firstN = H.find((h) => h.N !== null)?.N ?? null;
  const grow = firstN && cur.N !== null ? ((cur.N - firstN) / firstN) * 100 : null;
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const avgU = avg(H.map((h) => h.util));
  const avgCac = avg(H.map((h) => h.cac));
  const lossMonths = H.filter((h) => h.R || h.fixed || h.D).filter((h) => h.NP < 0).length;
  const dl = (a: number | null, b: number | null, inv = false, u = 'p.p.') => {
    if (a === null || b === null) return <span className="text-au-faint">o‘tgan oy: —</span>;
    const d = a - b;
    const good = inv ? d <= 0 : d >= 0;
    return (
      <span className={good ? 'pos' : 'neg'}>
        {d >= 0 ? '▲ +' : '▼ −'}
        {Math.abs(d).toFixed(1)} {u}
      </span>
    );
  };
  const target = fin.settings.target;
  const cards: { n: number; t: string; v: string; d: React.ReactNode; series: Parameters<typeof Chart>[0]['series']; fmt: (v: number) => string }[] = [
    {
      n: 1,
      t: 'Yalpi marja',
      v: pc(cur.gm),
      d: dl(cur.gm, prev.gm),
      fmt: (v) => `${Math.round(v)}%`,
      series: [
        { n: 'Yalpi marja', c: 'var(--au-ink)', v: H.map((h) => n0(h.gm)), kind: 'line' },
        { n: `Maqsad ${target}%`, c: 'var(--au-accent)', v: H.map(() => target), kind: 'line', dash: true },
      ],
    },
    {
      n: 2,
      t: 'Sof biznes foydasi',
      v: pc(cur.npm),
      d: dl(cur.npm, prev.npm),
      fmt: (v) => `${Math.round(v)}%`,
      series: [{ n: 'Sof marja', c: 'var(--au-accent)', v: H.map((h) => n0(h.npm)), kind: 'line' }],
    },
    {
      n: 3,
      t: 'Zararsizlik nuqtasi',
      v: cur.bep === null ? '—' : `${cur.bep} o‘q.`,
      d:
        cur.bep !== null && cur.N !== null ? (
          <span className={cur.N >= cur.bep ? 'pos' : 'neg'}>zaxira {cur.N - cur.bep} o‘q.</span>
        ) : (
          <span className="text-au-faint">ma’lumot yetarli emas</span>
        ),
      fmt: (v) => `${Math.round(v)} ta`,
      series: [
        { n: 'Jami o‘quvchi', c: 'var(--au-ink)', v: H.map((h) => n0(h.N)), kind: 'line' },
        { n: 'Zararsizlik nuqtasi', c: 'var(--au-bad)', v: H.map((h) => n0(h.bep)), kind: 'line', dash: true },
      ],
    },
    {
      n: 4,
      t: 'Xonalar bandligi',
      v: pc(cur.util, 0),
      d: dl(cur.util, prev.util),
      fmt: (v) => `${Math.round(v)}%`,
      series: [
        { n: 'Bandlik', c: 'var(--au-info)', v: H.map((h) => n0(h.util)), kind: 'line' },
        { n: '90% · to‘la', c: 'var(--au-accent)', v: H.map(() => 90), kind: 'line', dash: true },
      ],
    },
    {
      n: 5,
      t: 'Qarzdorlik (4010)',
      v: fmtMln(cur.rec),
      d: dl(cur.rec / 1e6, prev.rec / 1e6, true, 'mln'),
      fmt: fmtMln,
      series: [{ n: 'Debitorlik', c: 'var(--au-bad)', v: H.map((h) => h.rec), kind: 'line' }],
    },
    {
      n: 6,
      t: 'CAC · 1 o‘quvchi narxi',
      v: ming(cur.cac),
      d: dl(cur.cac === null ? null : cur.cac / 1e3, prev.cac === null ? null : prev.cac / 1e3, true, 'ming'),
      fmt: (v) => `${Math.round(v / 1e3)} ming`,
      series: [
        { n: 'CAC', c: 'var(--au-accent)', v: H.map((h) => n0(h.cac)), kind: 'line' },
        { n: 'Oylik to‘lov', c: 'var(--au-ink)', v: H.map((h) => n0(h.fee)), kind: 'line', dash: true },
      ],
    },
  ];

  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s12 fn-hero">
        <div>
          <div className="l">12 oylik sof foyda</div>
          <div className="v">{fmtMln(yNP)}</div>
          <div className="d">
            {monthName(H[0].ym)} – {monthName(cur.ym)} · o‘rtacha sof marja {pc(yR ? (yNP / yR) * 100 : null)}
          </div>
        </div>
        <div>
          <div className="l">Yillik tushum</div>
          <div className="v">{fmtMln(yR)}</div>
          <div className="d">{(yR / 1e9).toFixed(2)} mlrd so‘m</div>
        </div>
        <div>
          <div className="l">O‘quvchilar</div>
          <div className="v">{cur.N ?? '—'}</div>
          <div className="d">{grow === null ? 'boshlang‘ich soni kiritilmagan' : `${grow >= 0 ? '▲' : '▼'} ${Math.abs(grow).toFixed(0)}% yil davomida`}</div>
        </div>
        <div>
          <div className="l">O‘rtacha bandlik</div>
          <div className="v">{pc(avgU, 0)}</div>
          <div className="d">hozir {pc(cur.util, 0)}</div>
        </div>
        <div>
          <div className="l">O‘rtacha CAC</div>
          <div className="v">{ming(avgCac)}</div>
          <div className="d">so‘m / o‘quvchi</div>
        </div>
        <div>
          <div className="l">Zararli oylar</div>
          <div className="v">{lossMonths} / 12</div>
          <div className="d">sof foyda &lt; 0</div>
        </div>
      </div>
      {cards.map((c) => (
        <div key={c.n} className="sx-card s4">
          <MH n={c.n} t={c.t} />
          <div className="fn-trc">
            <b>{c.v}</b>
            <span>{c.d}</span>
          </div>
          <Chart labels={labels} height={170} fmt={c.fmt} series={c.series} />
        </div>
      ))}
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Tushum, xarajat va sof foyda</h3>
          <small>12 oy · jurnaldan</small>
        </div>
        <Chart
          labels={labels}
          fmt={fmtMln}
          series={[
            { n: 'Tushum', c: '#ff9f1c', v: H.map((m) => m.R) },
            { n: 'Xarajat', c: '#c9c3b8', v: H.map((m) => m.D + m.fixed + m.tax) },
            { n: 'Sof foyda', c: '#139a52', v: H.map((m) => m.net), kind: 'line' },
          ]}
        />
      </div>
      <div className="sx-card s12">
        <MH t="Oylik moliyaviy jadval" en="mln so‘m · rang — sof marja" />
        <div className="overflow-x-auto">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Oy</th>
                <th>O‘quvchi</th>
                <th>Tushum</th>
                <th>To‘g‘r. xarajat</th>
                <th>Yalpi marja</th>
                <th>Doimiy xar.</th>
                <th>Sof foyda</th>
                <th>Sof marja</th>
                <th>Zararsizlik</th>
                <th>Bandlik</th>
                <th>Qarzdorlik</th>
                <th>CAC, ming</th>
              </tr>
            </thead>
            <tbody>
              {H.map((h) => (
                <tr key={h.ym} className={h.cur ? 'fn-cur' : ''}>
                  <td className="l">
                    {h.lb}
                    {h.cur ? ' · joriy' : ''}
                  </td>
                  <td>{h.N ?? '—'}</td>
                  <td>{(h.R / 1e6).toFixed(1)}</td>
                  <td>{(h.D / 1e6).toFixed(1)}</td>
                  <td>{pc(h.gm)}</td>
                  <td>{(h.fixed / 1e6).toFixed(1)}</td>
                  <td className={h.NP < 0 ? 'text-au-bad' : ''}>{(h.NP / 1e6).toFixed(1)}</td>
                  <td>
                    <span className="fn-hc" style={{ background: marginHeat(h.npm), color: Math.abs(h.npm ?? 0) > 9 ? '#fff' : undefined }}>
                      {pc(h.npm)}
                    </span>
                  </td>
                  <td>{h.bep ?? '—'}</td>
                  <td>{pc(h.util, 0)}</td>
                  <td>{(h.rec / 1e6).toFixed(1)}</td>
                  <td>{h.cac === null ? '—' : Math.round(h.cac / 1e3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">
                  <b>12 oy</b>
                </td>
                <td>—</td>
                <td>
                  <b>{(yR / 1e6).toFixed(0)}</b>
                </td>
                <td>
                  <b>{(yD / 1e6).toFixed(0)}</b>
                </td>
                <td>
                  <b>{pc(yR ? ((yR - yD) / yR) * 100 : null)}</b>
                </td>
                <td>
                  <b>{(yFixed / 1e6).toFixed(0)}</b>
                </td>
                <td>
                  <b>{(yNP / 1e6).toFixed(0)}</b>
                </td>
                <td>
                  <b>{pc(yR ? (yNP / yR) * 100 : null)}</b>
                </td>
                <td>—</td>
                <td>{pc(avgU, 0)}</td>
                <td>—</td>
                <td>{avgCac === null ? '—' : Math.round(avgCac / 1e3)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="sx-note">
          Pul ko‘rsatkichlari — Hisob-kitob jurnalidan; o‘quvchi soni, to‘lovlar va sig‘im — Moliya → «Ma’lumotlarni kiritish»dan (oyma-oy saqlanadi).
        </div>
      </div>
    </div>
  );
}
