'use client';

import type { Books } from '@/lib/accounting-data';
import { Fragment, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addMonths, courseEconomics, fmtMln, fmtNum, ledger, monthEnd, monthStart, statements } from '@/lib/accounting';
import { cvp, cvpCurve, flexBudget, segmentPL, costPerLessonHour, capacityFit, teacherCostFor, studentsForTarget, type BudgetLine, type Driver } from '@/lib/accounting-ma';
import { deleteBudgetAction, deleteCourseAction, saveCourseAction, setBudgetAction, setPlanStudentsAction } from '@/lib/actions/accounting';
import { ask, toast } from './suite-shell';
import { Chart, HBars } from './charts';
import { MoneyInput } from '@/components/ui/money-input';
import { pct, useRun } from './accounting-shared';

/* ------------------------------------------------------------------ MA · cost */
export function MaCost({ books, ym, courseGroups }: { books: Books; ym: string; courseGroups: { course: string; groups: number }[] }) {
  const { run, pending } = useRun();
  const st = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const fixed = st.selling + st.admin + st.other;
  const rows = books.courses.map((c) => ({ c, e: courseEconomics(c) }));
  const tot = rows.reduce(
    (a, x) => ({ rev: a.rev + x.e.revenue, dir: a.dir + x.e.direct, con: a.con + x.e.contribution, st: a.st + x.c.students }),
    { rev: 0, dir: 0, con: 0, st: 0 },
  );
  const hr = costPerLessonHour(books.courses, fixed);
  const missing = courseGroups.filter((g) => g.course && !books.courses.some((c) => c.name.toLowerCase() === g.course.toLowerCase()));
  const save = (id: string | undefined, v: { name: string; fee: number; students: number; teacherCost: number; bookCost: number; teacherShare?: number | null; hoursMonth?: number }) =>
    run(() => saveCourseAction({ id, ...v }), id ? `«${v.name}» saqlandi` : "Kurs qo'shildi");

  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Kurslar tushumi (reja)</div>
        <div className="v">{fmtMln(tot.rev)}</div>
        <div className="d">{tot.st} o‘quvchi · oylik</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Qoplama foyda</div>
        <div className="v" style={{ color: tot.con < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>{fmtMln(tot.con)}</div>
        <div className="d">Marja: {tot.rev ? pct(tot.con / tot.rev) : '—'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Doimiy xarajatlar (jurnal)</div>
        <div className="v">{fmtMln(fixed)}</div>
        <div className="d">marketing + ma’muriy + boshqa · shu oy</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Operatsion natija (model)</div>
        <div className="v" style={{ color: tot.con - fixed < 0 ? 'var(--au-bad)' : undefined }}>{fmtMln(tot.con - fixed)}</div>
        <div className="d">Qoplama − doimiy xarajat</div>
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kurslar iqtisodiyoti</h3>
          <small>narx, o‘quvchi soni va to‘g‘ridan-to‘g‘ri xarajat — o‘zgartirsangiz darhol qayta hisoblanadi</small>
          <span className="sp" />
          <button
            className="sx-btn sm"
            disabled={pending}
            onClick={() => save(undefined, { name: 'Yangi kurs', fee: 0, students: 0, teacherCost: 0, bookCost: 0 })}
          >
            <Plus className="size-3.5" /> Kurs
          </button>
        </div>
        {missing.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-au-muted">
            Saytdagi guruhlarda bor, bu yerda yo‘q:
            {missing.map((m) => (
              <button
                key={m.course}
                className="sx-chipb"
                disabled={pending}
                onClick={() => save(undefined, { name: m.course, fee: 0, students: 0, teacherCost: 0, bookCost: 0 })}
              >
                + {m.course} ({m.groups} guruh)
              </button>
            ))}
          </div>
        )}
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Kurs</th>
                <th>Oylik narx</th>
                <th>O‘quvchi</th>
                <th title="Bo‘sh — qat’iy oylik xarajat; to‘ldirilsa tushumning shu ulushi">O‘qituvchi ulushi, %</th>
                <th>O‘qituvchi xarajati</th>
                <th>Darslik / o‘quvchi</th>
                <th>Soat/oy</th>
                <th>Tushum</th>
                <th>Qoplama</th>
                <th>Marja</th>
                <th>Zararsizlik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="l">
                    <div className="sx-empty">Kurs qo‘shing — tushum, marja va zararsizlik nuqtasi shu yerda hisoblanadi.</div>
                  </td>
                </tr>
              )}
              {rows.map(({ c, e }, i) => (
                <CourseRow key={c.id + c.fee + c.students + c.teacher_cost + c.book_cost + c.name} c={c} e={e} i={i} onSave={(v) => save(c.id, v)} onDelete={async () => (await ask(`«${c.name}» kursi o'chirilsinmi?`)) && run(() => deleteCourseAction(c.id), "Kurs o'chirildi")} />
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="l">Jami</td>
                  <td />
                  <td>{tot.st}</td>
                  <td />
                  <td />
                  <td />
                  <td>{hr.hours || '—'}</td>
                  <td>{fmtNum(tot.rev)}</td>
                  <td>{fmtNum(tot.con)}</td>
                  <td>{tot.rev ? pct(tot.con / tot.rev) : '—'}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="sx-note">
          1 dars soati tannarxi: <b>{hr.perHour === null ? '—' : `${fmtNum(hr.perHour)} so‘m`}</b> — (to‘g‘ridan-to‘g‘ri + doimiy xarajat) / {hr.hours || 0} soat/oy.
          O‘qituvchi ulushi to‘ldirilsa, o‘qituvchi xarajati tushumning shu foizi sifatida hisoblanadi.
        </p>
      </div>
      {rows.length > 0 && (
        <div className="sx-card s12">
          <div className="sx-h">
            <h3>Tushum va to‘g‘ridan-to‘g‘ri xarajat</h3>
            <small>kurslar kesimida</small>
          </div>
          <Chart
            labels={rows.map((r) => r.c.name)}
            fmt={fmtMln}
            height={200}
            series={[
              { n: 'Tushum', c: '#ff9f1c', v: rows.map((r) => r.e.revenue) },
              { n: 'To‘g‘ridan-to‘g‘ri xarajat', c: '#c9c3b8', v: rows.map((r) => r.e.direct) },
              { n: 'Qoplama', c: '#139a52', v: rows.map((r) => r.e.contribution), kind: 'line' },
            ]}
          />
        </div>
      )}
      {rows.length > 0 && <CostAnalysis books={books} st={st} />}
    </div>
  );
}

/** Cost structure, CVP, keep/close decision and segment P&L — all from the
 * course model plus the month's journal fixed costs. */
function CostAnalysis({ books, st }: { books: Books; st: ReturnType<typeof statements> }) {
  const [drv, setDrv] = useState<Driver>('students');
  const fixed = st.selling + st.admin + st.other;
  const c = cvp(books.courses, fixed);
  const curve = cvpCurve(c);
  const seg = segmentPL(books.courses, fixed, drv);
  const parts = [
    { n: 'O‘qituvchilar', v: c.teacher, col: '#17161a', vr: true },
    { n: 'Darsliklar', v: c.books, col: '#5c5760', vr: true },
    { n: 'Sotish / marketing', v: st.selling, col: '#ff9f1c', vr: false },
    { n: "Ma'muriy", v: st.admin, col: '#ffc46b', vr: false },
    { n: 'Boshqa', v: st.other, col: '#ffe0ad', vr: false },
  ].filter((p) => p.v > 0);
  const T = parts.reduce((a, p) => a + p.v, 0) || 1;
  const maxCm = Math.max(1, ...seg.map((r) => Math.abs(r.contribution)));
  return (
    <>
      <div className="sx-card sx-stat dark s4">
        <div className="l">Marjinal daromad (CM)</div>
        <div className="v">{c.revenue ? pct(c.contribution / c.revenue) : '—'}</div>
        <div className="d">
          CM: {fmtMln(c.contribution)} · 1 o‘quvchidan {fmtMln(c.cm)}
        </div>
        <div className="d">
          Operatsion leverage: {c.leverage === null ? '—' : `${c.leverage.toFixed(1)}×`} · Xavfsizlik zonasi: {c.safety === null ? '—' : pct(c.safety)}
        </div>
      </div>
      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Xarajatlar tuzilishi</h3>
          <small>Fixed vs variable · o‘zgaruvchan = kurslar modelidagi to‘g‘ridan-to‘g‘ri xarajat, doimiy = kiritilgan xarajatlar</small>
        </div>
        <div className="flex h-7 overflow-hidden rounded-lg">
          {parts.map((p) => (
            <div key={p.n} title={`${p.n}: ${fmtNum(p.v)} (${pct(p.v / T)})`} style={{ flex: p.v, background: p.col }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-au-muted">
          {parts.map((p) => (
            <span key={p.n} className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-sm" style={{ background: p.col }} />
              {p.n} <b className="text-au-ink">{pct(p.v / T)}</b>
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            O‘zgaruvchan / o‘quvchi <b className="block tabular-nums">{fmtNum(c.vc)}</b>
          </div>
          <div>
            O‘rtacha to‘lov <b className="block tabular-nums">{fmtNum(c.fee)}</b>
          </div>
          <div>
            Zararsizlik <b className="block tabular-nums">{c.breakEven ?? '—'} o‘q.</b>
          </div>
          <div>
            O‘zgaruvchan / doimiy{' '}
            <b className="block tabular-nums">
              {pct(c.direct / T)} / {pct(fixed / T)}
            </b>
          </div>
        </div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>CVP tahlili</h3>
          <small>Tushum = narx × N · Jami xarajat = doimiy + o‘zgaruvchan × N · hozir {c.N} o‘quvchi</small>
        </div>
        <Chart
          labels={curve.map((p) => `${p.n}`)}
          fmt={fmtMln}
          height={230}
          series={[
            { n: 'Tushum', c: '#17161a', v: curve.map((p) => p.revenue), kind: 'line' },
            { n: 'Jami xarajat', c: '#c7322b', v: curve.map((p) => p.cost), kind: 'line' },
            { n: 'Doimiy xarajat', c: '#a39fa8', v: curve.map((p) => p.fixed), kind: 'line', dash: true },
          ]}
        />
        <p className="sx-note">
          X o‘qi — o‘quvchilar soni. Zararsizlik nuqtasi (BEP): <b>{c.breakEven ?? '—'}</b> o‘quvchi; undan o‘ngda — foyda zonasi.
        </p>
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Kursni yopish qarori</h3>
          <small>Relevant costing</small>
        </div>
        <p className="mb-2 text-xs text-au-muted">
          Taqsimlangan doimiy xarajat kurs yopilganda yo‘qolmaydi. Qaror faqat <b>CM</b> ga qarab qabul qilinadi.
        </p>
        <div className="flex flex-col gap-2">
          {seg.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-[110px] truncate">{r.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-au-card-2">
                <i className="block h-full rounded" style={{ width: `${Math.max(2, (Math.abs(r.contribution) / maxCm) * 100)}%`, background: r.keep ? 'var(--au-ink)' : 'var(--au-bad)' }} />
              </div>
              <b className="w-[70px] text-right tabular-nums">{fmtMln(r.contribution)}</b>
              <span className={cn('sx-pl', r.keep ? 'ok' : 'bad')}>{r.keep ? 'Davom ettirish' : 'Qayta ko‘rish'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kurslar bo‘yicha segment hisoboti</h3>
          <small>Segment P&amp;L · doimiy xarajatni taqsimlash asosi:</small>
          <span className="sp" />
          {(
            [
              ['students', 'O‘quvchi soni'],
              ['revenue', 'Tushum ulushi'],
              ['equal', 'Teng'],
            ] as const
          ).map(([k, n]) => (
            <button key={k} className={cn('sx-chipb', drv === k && 'on')} onClick={() => setDrv(k)}>
              {n}
            </button>
          ))}
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Kurs</th>
                <th>O‘quvchi</th>
                <th>Tushum</th>
                <th>O‘zgaruvchan</th>
                <th>CM</th>
                <th>CM %</th>
                <th>CM / o‘quvchi</th>
                <th>Soat/oy</th>
                <th>Taqsimlangan doimiy</th>
                <th>Segment foydasi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {seg.map((r) => (
                <tr key={r.id}>
                  <td className="l">{r.name}</td>
                  <td>{r.students}</td>
                  <td>{fmtNum(r.revenue)}</td>
                  <td>{fmtNum(r.direct)}</td>
                  <td>
                    <b>{fmtNum(r.contribution)}</b>
                  </td>
                  <td>{pct(r.margin)}</td>
                  <td>{fmtNum(r.perStudent)}</td>
                  <td>{r.hours || '—'}</td>
                  <td>{fmtNum(r.alloc)}</td>
                  <td style={{ color: r.segment < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>
                    <b>{fmtNum(r.segment)}</b>
                  </td>
                  <td>
                    <span className={cn('sx-pl', r.status === 'loss' ? 'bad' : r.status === 'low' ? 'warn' : 'ok')}>
                      {r.status === 'loss' ? 'Zarar' : r.status === 'low' ? 'Past marja' : 'Sog‘lom'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Jami</td>
                <td>{c.N}</td>
                <td>{fmtNum(c.revenue)}</td>
                <td>{fmtNum(c.direct)}</td>
                <td>{fmtNum(c.contribution)}</td>
                <td>{c.revenue ? pct(c.contribution / c.revenue) : '—'}</td>
                <td>{fmtNum(c.cm)}</td>
                <td>{seg.reduce((a, r) => a + r.hours, 0) || '—'}</td>
                <td>{fmtNum(fixed)}</td>
                <td>{fmtNum(c.profit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

function CourseRow({
  c,
  e,
  i,
  onSave,
  onDelete,
}: {
  c: Books['courses'][number];
  e: ReturnType<typeof courseEconomics>;
  i: number;
  onSave: (v: { name: string; fee: number; students: number; teacherCost: number; bookCost: number; teacherShare: number | null; hoursMonth: number }) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState({
    name: c.name,
    fee: c.fee,
    students: c.students,
    teacherCost: c.teacher_cost,
    bookCost: c.book_cost,
    teacherShare: c.teacher_share ?? null,
    hoursMonth: c.hours_month ?? 0,
  });
  const commit = (next = v) => {
    if (
      next.name.trim() &&
      (next.name !== c.name ||
        next.fee !== c.fee ||
        next.students !== c.students ||
        next.teacherCost !== c.teacher_cost ||
        next.bookCost !== c.book_cost ||
        next.teacherShare !== (c.teacher_share ?? null) ||
        next.hoursMonth !== (c.hours_month ?? 0))
    )
      onSave({ ...next, name: next.name.trim() });
  };
  const shared = v.teacherShare !== null;
  const num = (k: 'fee' | 'students' | 'teacherCost' | 'bookCost' | 'hoursMonth') => (
    <MoneyInput
      className="sx-plain-inp"
      disabled={k === 'teacherCost' && shared}
      title={k === 'teacherCost' && shared ? 'O‘qituvchi ulushidan hisoblanadi' : undefined}
      value={k === 'teacherCost' && shared ? teacherCostFor(v.fee, v.students, v.teacherShare, v.teacherCost) : v[k]}
      onValue={(n) => setV({ ...v, [k]: n ?? 0 })}
      onBlur={() => commit()}
      onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
    />
  );
  return (
    <tr style={{ animationDelay: `${i * 30}ms` }}>
      <td className="l">
        <input
          className="sx-plain-inp !w-[160px] !text-left"
          value={v.name}
          maxLength={120}
          onChange={(ev) => setV({ ...v, name: ev.target.value })}
          onBlur={() => commit()}
        />
      </td>
      <td>{num('fee')}</td>
      <td>{num('students')}</td>
      <td>
        <input
          className="sx-plain-inp !w-[64px]"
          type="number"
          min={0}
          max={100}
          placeholder="—"
          aria-label="O‘qituvchi ulushi, %"
          value={v.teacherShare ?? ''}
          onChange={(ev) => setV({ ...v, teacherShare: ev.target.value === '' ? null : Math.min(100, Math.max(0, Number(ev.target.value) || 0)) })}
          onBlur={() => commit()}
          onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
        />
      </td>
      <td>{num('teacherCost')}</td>
      <td>{num('bookCost')}</td>
      <td>{num('hoursMonth')}</td>
      <td>{fmtNum(e.revenue)}</td>
      <td style={{ color: e.contribution < 0 ? 'var(--au-bad)' : undefined }}>{fmtNum(e.contribution)}</td>
      <td>{e.revenue ? pct(e.margin) : '—'}</td>
      <td>
        {e.breakEven === null ? '—' : (
          <span className={cn('sx-pl', c.students >= e.breakEven ? 'ok' : 'bad')}>{e.breakEven} o‘quvchi</span>
        )}
      </td>
      <td>
        <button className="sx-btn sm text-au-bad" onClick={onDelete} aria-label="O'chirish">
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- MA · budget */
/** Plan amount cell: comma-grouped, saved on blur / Enter. */
function BudgetCell({ plan, onCommit }: { plan: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState<number | null>(plan || null);
  return (
    <MoneyInput
      className="sx-plain-inp !w-[130px]"
      value={v}
      onValue={setV}
      onBlur={() => (v ?? 0) !== plan && onCommit(v ?? 0)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const BUDGET_LINES = ['9030', '9130', '9410', '9420', '9430', '9810'];
export function MaBudget({ books, ym }: { books: Books; ym: string }) {
  const { run } = useRun();
  const [flex, setFlex] = useState(true);
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const lines: BudgetLine[] = BUDGET_LINES.filter((c) => L[c]).map((code) => {
    const a = L[code];
    const actual = a.type === 'R' ? a.credit - a.debit : a.debit - a.credit;
    const plan = books.budget.find((b) => b.period === ym && b.code === code)?.amount ?? 0;
    return { code, name: a.name, type: a.type === 'R' ? 'R' : 'X', plan, actual };
  });
  const plannedN = books.planStudents[ym] ?? 0;
  const actualN = books.courses.reduce((a, c) => a + c.students, 0);
  const fb = flexBudget(lines, plannedN, actualN, flex);
  const maxV = Math.max(1, ...fb.rows.map((r) => Math.abs(r.total)));
  const vv = (v: number) => (
    <span style={{ color: v === 0 ? undefined : v > 0 ? 'var(--au-ok)' : 'var(--au-bad)' }}>
      {v > 0 ? '+' : v < 0 ? '−' : ''}
      {fmtNum(Math.abs(v))} {v === 0 ? '' : v > 0 ? 'F' : 'U'}
    </span>
  );
  const copyPrev = () => {
    const prev = books.budget.filter((b) => b.period === addMonths(ym, -1));
    if (!prev.length) return toast.message("O'tgan oy byudjeti yo'q");
    run(async () => {
      for (const b of prev) {
        const r = await setBudgetAction({ month: ym, code: b.code, amount: b.amount });
        if (r.error) return r;
      }
      return {};
    }, "O'tgan oy byudjeti ko'chirildi");
  };
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat s3">
        <div className="l">Byudjet foydasi</div>
        <div className="v">{fmtMln(fb.plan)}</div>
        <div className="d">{plannedN ? `${plannedN} o‘quvchi rejasida` : 'Rejadagi o‘quvchi kiritilmagan'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Moslashuvchan byudjet · Flexed</div>
        <div className="v">{fmtMln(fb.flexed)}</div>
        <div className="d">
          Fakt hajmi: {actualN} o‘quvchi{fb.k !== 1 ? ` (${fb.k >= 1 ? '+' : ''}${((fb.k - 1) * 100).toFixed(1)}%)` : ''}
        </div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Fakt foydasi</div>
        <div className="v" style={{ color: fb.actual >= fb.plan ? 'var(--au-ok)' : 'var(--au-bad)' }}>
          {fmtMln(fb.actual)}
        </div>
        <div className="d">Soliq va kommunal bilan · jurnaldan</div>
      </div>
      <div className="sx-card sx-stat dark s3">
        <div className="l">Umumiy og‘ish · Total variance</div>
        <div className="v">{fmtMln(fb.actual - fb.plan)}</div>
        <div className="d">{fb.actual >= fb.plan ? 'Rejadan yaxshi (F)' : 'Rejadan yomon (U)'}</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Og‘ishlar tahlili</h3>
          <small>Hajm og‘ishi = Moslashuvchan − Statik · Narx/samaradorlik = Fakt − Moslashuvchan</small>
          <span className="sp" />
          <button className={cn('sx-chipb', flex && 'on')} onClick={() => setFlex(true)}>
            Moslashuvchan byudjet
          </button>
          <button className={cn('sx-chipb', !flex && 'on')} onClick={() => setFlex(false)}>
            Statik byudjet
          </button>
          <button className="sx-btn sm" onClick={copyPrev}>
            O‘tgan oydan ko‘chirish
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-au-muted">
          <span>F — foydali, U — zararli og‘ish. Byudjet ustunini tahrirlash mumkin.</span>
          <label className="inline-flex items-center gap-2">
            Rejadagi o‘quvchi
            <input
              key={`${ym}${plannedN}`}
              className="sx-plain-inp !w-[90px]"
              type="number"
              min={0}
              placeholder="0"
              defaultValue={plannedN || ''}
              onBlur={(e) => {
                const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                if (v !== plannedN) run(() => setPlanStudentsAction({ month: ym, students: v }), 'Rejadagi o‘quvchi saqlandi');
              }}
            />
            ta
          </label>
          <span>Fakt o‘quvchi — «Kurslar va marja» jadvalidan ({actualN}).</span>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Modda</th>
                <th>Statik byudjet</th>
                <th>Moslashuvchan</th>
                <th>Fakt</th>
                <th>Hajm og‘ishi</th>
                <th>Narx / samaradorlik</th>
                <th>Jami og‘ish</th>
                <th className="l" style={{ width: '18%' }}>
                  Foydaga ta’siri
                </th>
              </tr>
            </thead>
            <tbody>
              {fb.rows.map((l, i) => (
                <tr key={l.code} style={{ animationDelay: `${i * 30}ms` }}>
                  <td className="l">
                    {l.name}
                    {l.variable && <small className="ml-1 text-au-faint">o‘zg.</small>}
                  </td>
                  <td>
                    <BudgetCell
                      key={`${ym}${l.plan}`}
                      plan={l.plan}
                      onCommit={(v) => run(() => setBudgetAction({ month: ym, code: l.code, amount: v }))}
                    />
                    {l.plan > 0 && (
                      <button
                        className="ml-1 text-au-faint hover:text-au-bad"
                        aria-label="Reja qatorini o‘chirish"
                        onClick={async () =>
                          (await ask(`«${l.name}» rejasi o‘chirilsinmi?`)) &&
                          run(() => deleteBudgetAction({ period: `${ym}-01`, code: l.code }), 'Reja qatori o‘chirildi')
                        }
                      >
                        ✕
                      </button>
                    )}
                  </td>
                  <td>{fmtNum(l.flexed)}</td>
                  <td>
                    <b>{fmtNum(l.actual)}</b>
                  </td>
                  <td>{vv(l.volume)}</td>
                  <td>{vv(l.spending)}</td>
                  <td>
                    <b>{vv(l.total)}</b>
                  </td>
                  <td className="l">
                    <div className="relative h-2 rounded bg-au-card-2">
                      <i
                        className="absolute inset-y-0 rounded"
                        style={{
                          [l.total >= 0 ? 'left' : 'right']: '50%',
                          width: `${(Math.abs(l.total) / maxV) * 50}%`,
                          background: l.total >= 0 ? 'var(--au-ok)' : 'var(--au-bad)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Foyda</td>
                <td>{fmtNum(fb.plan)}</td>
                <td>{fmtNum(fb.flexed)}</td>
                <td>{fmtNum(fb.actual)}</td>
                <td>{vv(fb.flexed - fb.plan)}</td>
                <td>{vv(fb.actual - fb.flexed)}</td>
                <td>{vv(fb.actual - fb.plan)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-4">
          <Chart
            labels={fb.rows.map((l) => l.name)}
            fmt={fmtMln}
            height={180}
            series={[
              { n: flex ? 'Moslashuvchan reja' : 'Reja', c: '#d9d2c6', v: fb.rows.map((l) => l.flexed) },
              { n: 'Fakt', c: '#ff9f1c', v: fb.rows.map((l) => l.actual) },
            ]}
          />
        </div>
        <p className="sx-note">O‘zgaruvchan moddalar (tushum, tannarx, soliq) fakt/reja o‘quvchi nisbatida moslashtiriladi; qolganlari doimiy.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- MA · sim */
/** Scenario drivers are absolute changes, not percentages (owner,
 * 2026-10-05): so'm per student for the price, head-count for students and
 * monthly so'm for the cost lines. */
const SIM_LABEL = {
  price: 'Kurs narxi (1 o‘quvchi, oylik)',
  students: 'O‘quvchilar soni',
  teacher: 'O‘qituvchilar xarajati (oylik)',
  admin: 'Ma’muriy xarajat (ijara va b.)',
  mkt: 'Marketing (oylik)',
} as const;
const SIM_UNIT = { price: 'so‘m', students: 'ta', teacher: 'so‘m', admin: 'so‘m', mkt: 'so‘m' } as const;
type SimK = keyof typeof SIM_LABEL;
const SIM_ZERO: Record<SimK, number> = { price: 0, students: 0, teacher: 0, admin: 0, mkt: 0 };
const signed = (v: number, unit: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v))}${unit ? ` ${unit}` : ''}`;

export function MaSim({ books, ym, seatCap }: { books: Books; ym: string; seatCap: number }) {
  const [sm, setSm] = useState<Record<SimK, number>>(SIM_ZERO);
  const st = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const N = books.courses.reduce((a, c) => a + c.students, 0);
  const avgFee = N ? books.courses.reduce((a, c) => a + c.fee * c.students, 0) / N : 0;
  const avgBook = N ? books.courses.reduce((a, c) => a + c.book_cost * c.students, 0) / N : 0;
  const hasCourses = books.courses.length > 0;
  const base0 = {
    revenue: hasCourses ? books.courses.reduce((a, c) => a + c.fee * c.students, 0) : st.revenue,
    teacher: hasCourses
      ? books.courses.reduce((a, c) => a + teacherCostFor(c.fee, c.students, c.teacher_share ?? null, c.teacher_cost), 0)
      : st.cogs,
    books: hasCourses ? books.courses.reduce((a, c) => a + c.book_cost * c.students, 0) : 0,
  };
  const model = (k: Record<SimK, number>) => {
    const students = Math.max(0, N + k.students);
    const revenue = Math.max(0, base0.revenue + k.price * N + (avgFee + k.price) * k.students);
    const direct = Math.max(0, base0.teacher + k.teacher) + Math.max(0, base0.books + avgBook * k.students);
    const fixed = Math.max(0, st.admin + k.admin) + Math.max(0, st.selling + k.mkt) + st.other;
    const tax = books.tax.regime === 'turn' ? (revenue * books.tax.turnover) / 100 : 0;
    const profit = revenue - direct - fixed - tax;
    return { students, revenue, direct, fixed, tax, profit };
  };
  const base = model(SIM_ZERO);
  const sc = model(sm);
  const field = (k: SimK) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
      <span className="flex justify-between gap-2">
        {SIM_LABEL[k]}
        <b className="tabular-nums text-au-ink">{sm[k] ? signed(sm[k], SIM_UNIT[k]) : '—'}</b>
      </span>
      <span className="flex items-center gap-1.5">
        <select
          className="sx-inp !w-[64px]"
          aria-label="Yo‘nalish"
          value={sm[k] < 0 ? '-' : '+'}
          onChange={(e) => setSm({ ...sm, [k]: e.target.value === '-' ? -Math.abs(sm[k]) : Math.abs(sm[k]) })}
        >
          <option value="+">+</option>
          <option value="-">−</option>
        </select>
        <MoneyInput
          className="sx-inp min-w-0 flex-1 text-right"
          aria-label={SIM_LABEL[k]}
          value={Math.abs(sm[k])}
          onValue={(v) => setSm({ ...sm, [k]: (sm[k] < 0 ? -1 : 1) * (v ?? 0) })}
        />
        <span className="w-8 text-au-faint">{SIM_UNIT[k]}</span>
      </span>
    </label>
  );
  return (
    <div className="sx-grid">
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Ssenariy parametrlari</h3>
          <button className="sx-chipb ml-auto" onClick={() => setSm(SIM_ZERO)}>
            Nolga qaytarish
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {(Object.keys(SIM_LABEL) as SimK[]).map((k) => (
            <Fragment key={k}>{field(k)}</Fragment>
          ))}
        </div>
        <p className="sx-note">
          Hozir: {N} o‘quvchi · o‘rtacha narx {fmtNum(avgFee)} so‘m. Raqamlar — oylik o‘zgarish (masalan, narx +50,000 so‘m, o‘quvchi +10 ta).
          Asos: {hasCourses ? 'kurslar jadvali' : 'shu oydagi yozuvlar'} va {ym} oyidagi doimiy xarajatlar. Soliq:{' '}
          {books.tax.regime === 'turn' ? `aylanma ${books.tax.turnover}%` : 'umumiy rejim (foyda solig‘i hisobga olinmagan)'}.
        </p>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Natija</h3>
          <small>hozirgi holat vs ssenariy · so‘mda</small>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Ko‘rsatkich</th>
                <th>Hozir</th>
                <th>Ssenariy</th>
                <th>Farq</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="l">O‘quvchilar soni</td>
                <td>{fmtNum(base.students)}</td>
                <td>{fmtNum(sc.students)}</td>
                <td>{signed(sc.students - base.students, 'ta')}</td>
              </tr>
              {(
                [
                  ['Tushum', 'revenue'],
                  ['To‘g‘ridan-to‘g‘ri xarajat', 'direct'],
                  ['Doimiy xarajat', 'fixed'],
                  ['Soliq', 'tax'],
                ] as const
              ).map(([n, k]) => (
                <tr key={k}>
                  <td className="l">{n}</td>
                  <td>{fmtNum(base[k])}</td>
                  <td>{fmtNum(sc[k])}</td>
                  <td>{signed(sc[k] - base[k], '')}</td>
                </tr>
              ))}
              <tr className="big">
                <td className="l">Foyda</td>
                <td>{fmtNum(base.profit)}</td>
                <td style={{ color: sc.profit < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>{fmtNum(sc.profit)}</td>
                <td style={{ color: sc.profit >= base.profit ? 'var(--au-ok)' : 'var(--au-bad)' }}>{signed(sc.profit - base.profit, 'so‘m')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <HBars
            fmt={fmtNum}
            rows={[
              { n: 'Hozirgi foyda', v: base.profit, c: '#c9c3b8' },
              { n: 'Ssenariy foydasi', v: sc.profit, c: sc.profit >= base.profit ? '#139a52' : '#c7322b' },
            ]}
          />
        </div>
      </div>
      <SimExtra
        model={(k) => model(k).profit}
        sm={sm}
        setSm={setSm}
        books={books}
        st={st}
        seatCap={seatCap}
        steps={{
          price: Math.max(1000, Math.round((avgFee * 0.1) / 1000) * 1000),
          students: Math.max(1, Math.round(N * 0.1)),
          teacher: Math.max(100000, Math.round((base0.teacher * 0.1) / 1000) * 1000),
          admin: Math.max(100000, Math.round((st.admin * 0.1) / 1000) * 1000),
          mkt: Math.max(100000, Math.round((st.selling * 0.1) / 1000) * 1000),
        }}
      />
    </div>
  );
}

/** Presets, sensitivity and the target-profit head-count — all in numbers. */
function SimExtra({
  model,
  sm,
  setSm,
  books,
  st,
  seatCap,
  steps,
}: {
  seatCap: number;
  model: (k: Record<SimK, number>) => number;
  sm: Record<SimK, number>;
  setSm: (v: Record<SimK, number>) => void;
  books: Books;
  st: ReturnType<typeof statements>;
  /** One "typical" move per driver (≈10% of today's value, in its unit). */
  steps: Record<SimK, number>;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const p0 = model(sm);
  const tor = (Object.keys(SIM_LABEL) as SimK[])
    .map((k) => {
      const up = model({ ...sm, [k]: sm[k] + steps[k] }) - p0;
      const down = model({ ...sm, [k]: sm[k] - steps[k] }) - p0;
      return { k, up, down, range: Math.max(Math.abs(up), Math.abs(down)) };
    })
    .sort((a, b) => b.range - a.range);
  const mx = Math.max(1, ...tor.map((t) => t.range));
  const c = cvp(books.courses, st.selling + st.admin + st.other);
  const need = studentsForTarget(c.fixed, target ?? 0, c.cm);
  const fit = capacityFit(need, seatCap);
  const presets: [string, Partial<Record<SimK, number>>][] = [
    [`Narx +${fmtNum(steps.price)} so‘m`, { price: steps.price, students: -Math.round(steps.students / 2) }],
    [`Kengayish +${fmtNum(steps.students * 2)} o‘quvchi`, { students: steps.students * 2, mkt: steps.mkt * 5, admin: steps.admin * 3 }],
    [`Inqiroz −${fmtNum(steps.students * 2)} o‘quvchi`, { students: -steps.students * 2, price: -Math.round(steps.price / 2) }],
  ];
  return (
    <>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Tayyor ssenariylar</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map(([n, p]) => (
            <button
              key={n}
              className="sx-chipb"
              onClick={() => {
                setSm({ ...SIM_ZERO, ...p });
                toast.success(`Ssenariy qo‘llandi: ${n}`);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="sx-h mt-5">
          <h3>Maqsadli foyda uchun kerakli o‘quvchilar</h3>
        </div>
        <p className="mb-2 text-xs text-au-muted">N = (Doimiy xarajat + Maqsadli foyda) / (1 o‘quvchidan qoladigan foyda)</p>
        <label className="flex items-center gap-2 text-xs font-semibold text-au-muted">
          Maqsadli oylik sof foyda
          <MoneyInput className="sx-inp !w-[160px] text-right" value={target} onValue={setTarget} />
          so‘m
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            Kerakli o‘quvchi <b className="block text-lg tabular-nums">{need ?? '—'}</b>
          </div>
          <div>
            Hozir <b className="block text-lg tabular-nums">{c.N}</b>
          </div>
          <div>
            Farq{' '}
            <b className="block text-lg" style={{ color: need !== null && need <= c.N ? 'var(--au-ok)' : 'var(--au-bad)' }}>
              {need === null ? 'Marja manfiy' : need <= c.N ? 'maqsadga yetildi' : `+${need - c.N} kerak`}
            </b>
          </div>
          <div title={seatCap ? `Jadval sig‘imi: ${seatCap} o‘rin (xonalar × vaqtlar × toq/juft)` : 'Operatsiyalarda xona/vaqt kiritilmagan'}>
            Sig‘imga sig‘adimi{' '}
            <b className="block text-lg" style={{ color: fit.fits === null ? undefined : fit.fits ? 'var(--au-ok)' : 'var(--au-bad)' }}>
              {fit.fits === null ? '—' : fit.fits ? `ha (${fmtNum(need ?? 0)} / ${fmtNum(seatCap)})` : 'yo‘q'}
            </b>
          </div>
        </div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Sezuvchanlik</h3>
          <small>har bir ko‘rsatkich bir qadam o‘zgarsa foyda qancha o‘zgaradi</small>
        </div>
        <div className="flex flex-col gap-2">
          {tor.map((t) => (
            <div key={t.k} className="flex items-center gap-2 text-sm">
              <span className="w-[210px] truncate" title={SIM_LABEL[t.k]}>
                {SIM_LABEL[t.k].split(' (')[0]}{' '}
                <small className="text-au-faint">
                  ±{fmtNum(steps[t.k])} {SIM_UNIT[t.k]}
                </small>
              </span>
              <div className="relative h-3 flex-1 rounded bg-au-card-2">
                <i className="absolute inset-y-0 rounded-l" style={{ right: '50%', width: `${(Math.abs(Math.min(t.up, t.down, 0)) / mx) * 50}%`, background: 'var(--au-bad)' }} />
                <i className="absolute inset-y-0 rounded-r" style={{ left: '50%', width: `${(Math.max(t.up, t.down, 0) / mx) * 50}%`, background: 'var(--au-ok)' }} />
              </div>
              <b className="w-[110px] text-right tabular-nums">±{fmtNum(t.range)}</b>
            </div>
          ))}
        </div>
        <p className="sx-note">Qizil — foydani kamaytiradi, yashil — oshiradi. Summalar so‘mda.</p>
      </div>
    </>
  );
}
