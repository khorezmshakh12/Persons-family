'use client';

import { useMemo, useState, useTransition } from 'react';
import { FileDown, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { daysBetween, type StrategyTask } from '@/lib/strategy';
import { CAPACITY, level, loadMatrix, overloaded, RAG_META, suggestRag, weekStarts, type LoadItem, type Rag } from '@/lib/perforce-load';
import { deleteStatusUpdateAction, saveStatusUpdateAction } from '@/lib/actions/perforce';
import { ROLE_DEPT, type Role } from '@/lib/permissions';
import { riskScore } from '@/lib/perforce';
import { PersonAvatar } from './bits';
import { toast } from './suite-shell';
import type { PfData } from './perforce-workspace';

const LVL = {
  free: 'bg-au-card-2',
  ok: 'bg-[color-mix(in_oklab,var(--au-ok)_28%,transparent)]',
  busy: 'bg-[color-mix(in_oklab,#ff9f1c_40%,transparent)]',
  over: 'bg-[color-mix(in_oklab,var(--au-bad)_55%,transparent)] text-white',
} as const;
const DEPT_N: Record<string, string> = { top: 'Rahbariyat', acad: 'Akademik', com: 'Tijorat', ops: 'Operatsiya', fin: 'Moliya', hr: 'HR' };
const KIND_N: Record<LoadItem['kind'], string> = { stask: 'Loyiha vazifasi', task: 'Vazifa', issue: 'Muammo' };

/* ------------------------------------------------------------ resources */

export function ResourceLoad({ data, today }: { data: PfData; today: string }) {
  const weeks = useMemo(() => weekStarts(today, 8), [today]);
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState<{ id: string; w: number } | null>(null);
  const people = data.people.filter((p) => !dept || ROLE_DEPT[p.role as Role] === dept);
  const m = useMemo(() => loadMatrix({ stasks: data.stasks, tasks: data.tasks, issues: data.issues }, data.people.map((p) => p.id), weeks), [data, weeks]);
  const over = overloaded(m).filter((o) => people.some((p) => p.id === o.id));
  const rows = people
    .map((p) => ({ p, row: m.get(p.id)! }))
    .filter((r) => r.row.some((w) => w.points > 0))
    .sort((a, b) => b.row[0].points - a.row[0].points);
  const free = people.filter((p) => (m.get(p.id)?.[0].points ?? 0) === 0);
  const sel = open ? m.get(open.id)?.[open.w] : null;
  const selP = open ? data.people.find((p) => p.id === open.id) : null;

  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Shu hafta band</div>
        <div className="v">{rows.filter((r) => r.row[0].points > 0).length}</div>
        <div className="d">{people.length} kishidan</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Ortiqcha yuklangan</div>
        <div className="v" style={{ color: over.length ? 'var(--au-bad)' : 'var(--au-ok)' }}>{over.length}</div>
        <div className="d">sig‘im: {CAPACITY} ball / hafta</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Bo‘sh</div>
        <div className="v">{free.length}</div>
        <div className="d truncate">{free.slice(0, 3).map((p) => p.first_name).join(', ') || '—'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Bo‘lim</div>
        <select className="sx-inp mt-1 !h-[32px]" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Hammasi</option>
          {Object.entries(DEPT_N).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {over.length > 0 && (
        <div className="sx-card s12 !py-3">
          <b className="text-sm text-au-bad">Qayta taqsimlash kerak: </b>
          <span className="text-sm">
            {over
              .map((o) => {
                const p = data.people.find((x) => x.id === o.id);
                return `${p?.first_name ?? ''} ${p?.last_name ?? ''} — ${o.points} ball (${o.week === 0 ? 'shu hafta' : 'keyingi hafta'})`;
              })
              .join(' · ')}
          </span>
        </div>
      )}

      <div className={cn('sx-card', sel ? 's8' : 's12')}>
        <div className="sx-h">
          <h3>Yuklama · 8 hafta</h3>
          <small>loyiha vazifasi 4 · vazifa 2 · muammo 1 ball</small>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">Hech kimda ochiq ish yo‘q</div>
        ) : (
          <div className="sx-tw">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Xodim</th>
                  {weeks.map((w, i) => (
                    <th key={w}>{i === 0 ? 'Shu hafta' : `${w.slice(8)}.${w.slice(5, 7)}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, row }, ri) => (
                  <tr key={p.id} style={{ animationDelay: `${Math.min(ri, 15) * 30}ms` }}>
                    <td className="l">
                      <span className="flex items-center gap-2">
                        <PersonAvatar person={p} size={22} />
                        <span className="truncate">
                          {p.first_name} {p.last_name}
                        </span>
                      </span>
                    </td>
                    {row.map((w, i) => {
                      const lv = level(w.points);
                      return (
                        <td key={i} className="!p-1">
                          <button
                            onClick={() => setOpen(open?.id === p.id && open.w === i ? null : { id: p.id, w: i })}
                            title={`${w.points} ball · ${w.items.length} ish`}
                            className={cn(
                              'h-8 w-full min-w-10 rounded-md text-xs font-bold tabular-nums transition hover:ring-2 hover:ring-au-accent',
                              LVL[lv],
                              open?.id === p.id && open.w === i && 'ring-2 ring-au-ink',
                            )}
                          >
                            {w.points || ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sx-note">Muddati o‘tgan vazifalar va ochiq muammolar shu haftaga yoziladi. Rang: yashil ≤70% · sariq ≤100% · qizil sig‘imdan ortiq.</p>
      </div>
      {sel && selP && (
        <div className="sx-card s4">
          <div className="sx-h">
            <h3>
              {selP.first_name} · {open!.w === 0 ? 'shu hafta' : weeks[open!.w]}
            </h3>
            <small>{sel.points} ball</small>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {sel.items.map((it) => (
              <li key={it.kind + it.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate">{it.title}</span>
                <span className="sx-pl shrink-0">{KIND_N[it.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ status */

export type StatusUpdate = { id: string; space_id: string; rag: Rag; summary: string; next_steps: string; author_id: string | null; created_at: string };

function spaceNumbers(data: PfData, spaceId: string, today: string) {
  const s = data.spaces.find((x) => x.id === spaceId)!;
  const ts: StrategyTask[] = data.stasks.filter((t) => t.space_id === spaceId);
  const progress = ts.length ? ts.reduce((a, t) => a + (t.status === 'done' ? 100 : t.progress ?? 0), 0) / ts.length : 0;
  const total = Math.max(1, daysBetween(s.start_date, s.end_date));
  const elapsed = Math.max(0, Math.min(100, (daysBetween(s.start_date, today) / total) * 100));
  const late = ts.filter((t) => t.status !== 'done' && t.end_date < today);
  const risks = data.risks.filter((r) => r.space_id === spaceId && r.status !== 'closed' && riskScore(r) >= 12);
  const milestones = data.milestones.filter((m) => m.space_id === spaceId && m.date >= today).slice(0, 5);
  const crs = data.crs.filter((c) => c.space_id === spaceId && c.status !== 'approved' && c.status !== 'rejected');
  return { s, ts, progress, elapsed, late, risks, milestones, crs, rag: suggestRag(progress, elapsed, ts.length ? late.length / ts.length : 0, risks.length) };
}

export function StatusBoard({ data, today, viewerId, updates }: { data: PfData; today: string; viewerId?: string; updates: StatusUpdate[] }) {
  const router = useRouter();
  const [space, setSpace] = useState(data.spaces[0]?.id ?? '');
  const [form, setForm] = useState<{ rag: Rag; summary: string; next: string } | null>(null);
  const [busy, start] = useTransition();
  if (!data.spaces.length) return <div className="sx-card s12 sx-empty">Strategiyada loyiha yo‘q</div>;
  const n = spaceNumbers(data, space, today);
  const history = updates.filter((u) => u.space_id === space);
  const latestBySpace = new Map<string, StatusUpdate>();
  for (const u of updates) if (!latestBySpace.has(u.space_id)) latestBySpace.set(u.space_id, u);
  const nameOf = (id: string | null) => {
    const p = data.people.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : '—';
  };

  const save = () =>
    form &&
    start(async () => {
      const res = await saveStatusUpdateAction({ spaceId: space, rag: form.rag, summary: form.summary, nextSteps: form.next });
      if (res.error) return void toast.error('Saqlab bo‘lmadi');
      toast.success('Holat yozildi');
      setForm(null);
      router.refresh();
    });

  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Loyihalar holati</h3>
          <small>oxirgi yozuv · tizim tavsiyasi</small>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.spaces.map((s) => {
            const last = latestBySpace.get(s.id);
            const sug = spaceNumbers(data, s.id, today).rag;
            const stale = !last || daysBetween(last.created_at.slice(0, 10), today) > 8;
            return (
              <button
                key={s.id}
                onClick={() => setSpace(s.id)}
                className={cn('flex flex-col gap-1 rounded-au-ctl border p-3 text-left transition hover:bg-au-card-2', space === s.id ? 'border-au-accent' : 'border-au-line')}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <i className="size-2.5 rounded" style={{ background: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {last ? (
                    <span className="sx-pl" style={{ background: `color-mix(in oklab, ${RAG_META[last.rag].c} 18%, transparent)`, color: RAG_META[last.rag].c }}>
                      {RAG_META[last.rag].n}
                    </span>
                  ) : (
                    <span className="sx-pl">yozuv yo‘q</span>
                  )}
                  <span className="text-au-muted">tavsiya: {RAG_META[sug].n}</span>
                  {stale && <span className="text-au-bad">· 1 haftadan eski</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sx-card s8">
        <div className="sx-h">
          <h3>{n.s.name}</h3>
          <div className="flex gap-1.5">
            <button className="sx-btn sm" onClick={() => exportStatusPdf(n, history[0], nameOf)}>
              <FileDown className="size-3.5" /> PDF hisobot
            </button>
            {!form && (
              <button className="sx-btn primary sm" onClick={() => setForm({ rag: n.rag, summary: '', next: '' })}>
                Haftalik holat
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Bajarilish', `${Math.round(n.progress)}%`, `o‘tgan vaqt ${Math.round(n.elapsed)}%`],
            ['Kechikkan', String(n.late.length), `${n.ts.length} vazifadan`],
            ['Yuqori xavflar', String(n.risks.length), 'ball ≥ 12'],
            ['Ochiq o‘zgarishlar', String(n.crs.length), 'CR'],
          ].map(([l, v, d]) => (
            <div key={l}>
              <div className="text-[11px] font-bold text-au-muted uppercase">{l}</div>
              <div className="text-xl font-extrabold tabular-nums">{v}</div>
              <div className="text-xs text-au-muted">{d}</div>
            </div>
          ))}
        </div>
        {form && (
          <div className="mt-3 flex flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
            <div className="flex gap-1.5">
              {(Object.keys(RAG_META) as Rag[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setForm({ ...form, rag: r })}
                  className={cn('sx-btn sm', form.rag === r && 'primary')}
                  style={form.rag === r ? { background: RAG_META[r].c, borderColor: RAG_META[r].c } : undefined}
                >
                  {RAG_META[r].n}
                </button>
              ))}
              {form.rag !== n.rag && <span className="self-center text-[11px] text-au-muted">tizim tavsiyasi: {RAG_META[n.rag].n}</span>}
            </div>
            <textarea className="sx-inp !h-auto py-2" rows={3} placeholder="Bu hafta nima bo‘ldi?" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            <textarea className="sx-inp !h-auto py-2" rows={2} placeholder="Keyingi qadamlar / yordam kerak" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button className="sx-btn sm" onClick={() => setForm(null)}>
                Bekor
              </button>
              <button className="sx-btn primary sm" disabled={busy || !form.summary.trim()} onClick={save}>
                Saqlash
              </button>
            </div>
          </div>
        )}
        <ol className="mt-4 flex flex-col gap-3">
          {history.length === 0 && <li className="sx-empty">Hali holat yozilmagan</li>}
          {history.map((u) => (
            <li key={u.id} className="flex gap-3 border-l-[3px] pl-3" style={{ borderColor: RAG_META[u.rag].c }}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] text-au-muted">
                  <b style={{ color: RAG_META[u.rag].c }}>{RAG_META[u.rag].n}</b> · {nameOf(u.author_id)} · {u.created_at.slice(0, 10)}
                </span>
                <p className="text-sm whitespace-pre-wrap">{u.summary}</p>
                {u.next_steps && (
                  <p className="text-xs text-au-muted">
                    <b>Keyingi:</b> {u.next_steps}
                  </p>
                )}
              </div>
              {u.author_id === viewerId && (
                <button
                  className="self-start text-au-muted hover:text-au-bad"
                  aria-label="O‘chirish"
                  onClick={() =>
                    start(async () => {
                      const r = await deleteStatusUpdateAction(u.id);
                      if (r.error) return void toast.error('O‘chirib bo‘lmadi');
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Yaqin milestone’lar</h3>
        </div>
        {n.milestones.length === 0 ? (
          <div className="sx-empty">Rejalashtirilmagan</div>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {n.milestones.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">{m.title}</span>
                <span className="shrink-0 text-au-muted tabular-nums">{m.date.slice(5).replace('-', '.')}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="sx-h mt-4">
          <h3>Kechikkan vazifalar</h3>
        </div>
        {n.late.length === 0 ? (
          <div className="sx-empty">Yo‘q</div>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {n.late.slice(0, 8).map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-au-bad tabular-nums">{t.end_date.slice(5).replace('-', '.')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const latin = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[−–—]/g, '-').replace(/·/g, '-');

async function exportStatusPdf(n: ReturnType<typeof spaceNumbers>, last: StatusUpdate | undefined, nameOf: (id: string | null) => string) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  const rag = last?.rag ?? n.rag;
  const col = { green: [19, 154, 82], amber: [255, 159, 28], red: [229, 72, 77] }[rag] as [number, number, number];
  doc.setFillColor(27, 31, 42);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255);
  doc.setFontSize(15);
  doc.text(latin(n.s.name), 14, 12);
  doc.setFontSize(9);
  doc.text(latin(`Loyiha holati - ${new Date().toISOString().slice(0, 10)}`), 14, 19);
  doc.setFillColor(...col);
  doc.roundedRect(160, 8, 36, 10, 2, 2, 'F');
  doc.text(latin(RAG_META[rag].n), 178, 14.5, { align: 'center' });
  doc.setTextColor(20);
  autoTable(doc, {
    startY: 32,
    head: [['Bajarilish', "O'tgan vaqt", 'Kechikkan', 'Yuqori xavflar', 'Ochiq CR']],
    body: [[`${Math.round(n.progress)}%`, `${Math.round(n.elapsed)}%`, `${n.late.length} / ${n.ts.length}`, n.risks.length, n.crs.length]],
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 9 },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (last) {
    doc.setFontSize(10);
    doc.text(latin(`Oxirgi holat (${last.created_at.slice(0, 10)}, ${nameOf(last.author_id)}):`), 14, y);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(latin(last.summary + (last.next_steps ? `\nKeyingi: ${last.next_steps}` : '')), 182);
    doc.text(lines, 14, y + 5);
    y += 8 + lines.length * 4;
  }
  autoTable(doc, {
    startY: y,
    head: [['Yaqin milestone', 'Sana']],
    body: n.milestones.length ? n.milestones.map((m) => [latin(m.title), m.date]) : [['-', '']],
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [['Kechikkan vazifa', 'Muddat']],
    body: n.late.length ? n.late.slice(0, 15).map((t) => [latin(t.title), t.end_date]) : [['-', '']],
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [['Yuqori xavf', 'Ball', 'Choralar']],
    body: n.risks.length ? n.risks.map((r) => [latin(r.title), riskScore(r), latin(r.mitigation ?? '')]) : [['-', '', '']],
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 9 },
  });
  doc.save(`holat-${latin(n.s.name).replace(/\s+/g, '-')}.pdf`);
}
