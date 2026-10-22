'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { isScheduled, toMin } from '@/lib/ops-schedule';
import { courseColor, toSched } from './ops-schedule-timeline';
import type { OpsData } from './operations-workspace';

const COH = { odd: 'Toq', even: 'Juft' } as const;
const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;

/**
 * Bo'sh joylar vitrinasi (2026-10-22): every scheduled group with seats left,
 * by course — what sales can offer a lead today (course, days, time, seats).
 */
export function SeatShowcase({ data, capOf }: { data: OpsData; capOf: (r: string) => number }) {
  const [q, setQ] = useState('');
  const rows = useMemo(
    () =>
      toSched(data.groups)
        .filter(isScheduled)
        .map((g) => ({ g, free: Math.max(0, capOf(g.room) - (g.enrolled ?? 0)), known: g.enrolled != null }))
        .filter((r) => r.known && r.free > 0),
    [data.groups, capOf],
  );
  const courses = [...new Set(rows.map((r) => r.g.course.trim() || 'Kurssiz'))].sort((a, b) => a.localeCompare(b));
  const shown = courses.filter((c) => !q || c.toLowerCase().includes(q.toLowerCase()));
  const total = rows.reduce((a, r) => a + r.free, 0);
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Bo‘sh joylar vitrinasi</h3>
        <small>
          {total} ta bo‘sh o‘rin · {rows.length} guruhda — lidga shu yerdan guruh taklif qiling
        </small>
        <span className="sp" />
        <input className="sx-inp !w-[180px]" placeholder="Kurs bo‘yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <div className="sx-empty">{rows.length ? 'Bunday kurs topilmadi' : 'Bo‘sh joyli guruh yo‘q (yoki o‘quvchi soni kiritilmagan)'}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const list = rows.filter((r) => (r.g.course.trim() || 'Kurssiz') === c).sort((a, b) => toMin(a.g.time) - toMin(b.g.time));
            return (
              <div key={c} className="rounded-xl border border-au-line p-3">
                <div className="mb-2 flex items-center gap-2">
                  <i className="inline-block h-3 w-1.5 rounded-full" style={{ background: courseColor(c) }} />
                  <b className="text-au-ink">{c}</b>
                  <span className="flex-1" />
                  <span className="sx-pl ok">{list.reduce((a, r) => a + r.free, 0)} o‘rin</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {list.map(({ g, free }) => (
                    <li key={g.id} className="flex items-center gap-2 text-sm">
                      <span className="w-[86px] shrink-0 text-au-muted">
                        {COH[g.cohort]} · {g.time}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={`${g.name} · ${g.teacher}`}>
                        {g.name} <span className="text-xs text-au-faint">· {g.room}</span>
                      </span>
                      <span className={cn('sx-pl', free <= 2 ? 'warn' : 'info')}>{free}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Guruh daromadliligi (2026-10-22): CRM tariffs of a group's active students
 * against its teacher's cost (monthly salary split over their groups). Two
 * weak groups of one course and cohort that fit one room are offered a merge.
 */
export function GroupProfit({ data, capOf }: { data: OpsData; capOf: (r: string) => number }) {
  const groups = useMemo(() => toSched(data.groups), [data.groups]);
  const pay = data.salaries;
  const perTeacher = new Map<string, number>();
  for (const g of groups) if (g.teacher_id) perTeacher.set(g.teacher_id, (perTeacher.get(g.teacher_id) ?? 0) + 1);
  const rows = data.money
    .map((m) => {
      const g = groups.find((x) => x.id === m.groupId)!;
      const cost = pay && g.teacher_id && pay[g.teacher_id] ? pay[g.teacher_id] / (perTeacher.get(g.teacher_id) ?? 1) : null;
      const profit = cost === null ? null : m.expected - cost;
      const margin = profit === null || m.expected <= 0 ? null : profit / m.expected;
      return { g, m, cost, profit, margin };
    })
    .sort((a, b) => (a.profit ?? Infinity) - (b.profit ?? Infinity));
  const weak = rows.filter((r) => r.margin !== null && r.margin < 0.15 && isScheduled(r.g));
  const merges: { a: (typeof rows)[number]; b: (typeof rows)[number]; room: string; n: number }[] = [];
  const used = new Set<string>();
  for (const a of weak)
    for (const b of weak) {
      if (a === b || used.has(a.g.id) || used.has(b.g.id)) continue;
      if (a.g.cohort !== b.g.cohort || a.g.course.trim().toLowerCase() !== b.g.course.trim().toLowerCase()) continue;
      const n = a.m.students + b.m.students;
      const room = capOf(a.g.room) >= capOf(b.g.room) ? a.g.room : b.g.room;
      if (n <= capOf(room)) {
        merges.push({ a, b, room, n });
        used.add(a.g.id).add(b.g.id);
      }
    }
  const sum = (f: (r: (typeof rows)[number]) => number | null) => rows.reduce((t, r) => t + (f(r) ?? 0), 0);

  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Guruh daromadliligi</h3>
        <small>CRM tariflari · {pay ? 'o‘qituvchi xarajati oylikdan taxminiy' : 'o‘qituvchi xarajati faqat moliya ruxsati borlarga'}</small>
      </div>
      {rows.length === 0 ? (
        <div className="sx-empty">CRM’da shu nomli guruhlar topilmadi — guruh nomlari jadval va CRM’da bir xil bo‘lishi kerak.</div>
      ) : (
        <>
          {merges.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {merges.map((x) => (
                <li key={x.a.g.id} className="rounded-lg border border-au-accent/30 bg-au-accent-soft/60 px-3 py-2 text-sm text-au-ink">
                  💡 <b>{x.a.g.name}</b> + <b>{x.b.g.name}</b> birlashtirilsa: {x.n} o‘quvchi, {x.room} xonasiga sig‘adi
                  {x.a.cost !== null && x.b.cost !== null && <span className="text-au-muted"> · tejash ≈ {som(Math.min(x.a.cost, x.b.cost))}/oy</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="sx-tw max-h-[460px] overflow-auto">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Guruh</th>
                  <th>O‘quvchi</th>
                  <th>Oylik tarif</th>
                  <th>Shu oy to‘langan</th>
                  {pay && <th>O‘qituvchi xarajati</th>}
                  {pay && <th>Foyda</th>}
                  <th className="l">Holat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ g, m, cost, profit, margin }) => (
                  <tr key={g.id}>
                    <td className="l">
                      <b>{g.name}</b>
                      <div className="text-xs text-au-muted">
                        {g.course || '—'} · {g.teacher || '—'}
                      </div>
                    </td>
                    <td>{m.students}</td>
                    <td>{som(m.expected)}</td>
                    <td>{som(m.paid)}</td>
                    {pay && <td>{cost === null ? '—' : som(cost)}</td>}
                    {pay && <td style={{ color: profit !== null && profit < 0 ? 'var(--au-bad)' : undefined }}>{profit === null ? '—' : som(profit)}</td>}
                    <td className="l">
                      {margin === null ? (
                        <span className="sx-pl mute">{m.students ? 'xarajat noma’lum' : 'o‘quvchi yo‘q'}</span>
                      ) : (
                        <span className={cn('sx-pl', margin < 0 ? 'bad' : margin < 0.15 ? 'warn' : 'ok')}>{margin < 0 ? 'Zarar' : margin < 0.15 ? 'Past foyda' : 'Foyda'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">
                    <b>Jami</b>
                  </td>
                  <td>{sum((r) => r.m.students)}</td>
                  <td>{som(sum((r) => r.m.expected))}</td>
                  <td>{som(sum((r) => r.m.paid))}</td>
                  {pay && <td>{som(sum((r) => r.cost))}</td>}
                  {pay && <td>{som(sum((r) => r.profit))}</td>}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
