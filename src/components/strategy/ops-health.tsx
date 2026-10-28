'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { getOpsHealthAction } from '@/lib/actions/ops-health';
import { shiftMonthKey, type Health, type NameItem } from '@/lib/ops-health';
import { dmy, som } from './ops-students-meta';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const mLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mShort = (m: string) => SHORT[Number(m.slice(5, 7)) - 1];
const mln = (v: number) => `${(v / 1_000_000).toFixed(1)}m`;

type Open = { title: string; items: NameItem[] } | null;

/** Statistika › Markaz holati: one month of the centre, each count opens the students behind it. */
export function OpsHealth({ month: current }: { month: string }) {
  const [month, setMonth] = useState(current);
  const [h, setH] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Open>(null);

  // Loads once per chosen month; a server read, no router refresh.
  useEffect(() => {
    let live = true;
    setFailed(false);
    getOpsHealthAction(month).then((r) => {
      if (!live) return;
      if (r.health) setH(r.health);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [month]);

  const months = Array.from({ length: 12 }, (_, i) => shiftMonthKey(current, -i));
  const head = (
    <div className="sx-card s12 !pb-2">
      <div className="sx-h !mb-0 flex-wrap">
        <h3>Markaz holati</h3>
        <small>{h && h.month === month ? `${dmy(h.month)} – ${dmy(h.to)} · faqat bazadagi yozuvlardan, raqamni bosing: ro‘yxati ochiladi` : 'Yuklanmoqda…'}</small>
        <span className="flex-1" />
        <select className="sx-inp !w-auto" aria-label="Oy" value={month} onChange={(e) => { setOpen(null); setMonth(e.target.value); }}>
          {months.map((m) => (
            <option key={m} value={m}>
              {mLabel(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
  if (!h || h.month !== month) return <>{head}<div className="sx-card s12"><div className="sx-empty">{failed ? 'Statistikani yuklab bo‘lmadi' : 'Yuklanmoqda…'}</div></div></>;

  const st = h.students;
  const mo = h.money;
  const f = h.funnel;
  const show = (title: string, items: NameItem[]) => setOpen(open?.title === title ? null : { title, items });
  const tMax = Math.max(1, ...h.trend.map((t) => t.active));
  const cMax = Math.max(1, ...h.trend.map((t) => t.collected));

  return (
    <>
      {head}
      <Section>O‘quvchilar</Section>
      <Tile l="Faol o‘quvchilar" v={st.activeEnd} d={`oy boshida ${st.activeStart} · ${st.activeEnd - st.activeStart >= 0 ? '+' : ''}${st.activeEnd - st.activeStart}`} tone={st.activeEnd >= st.activeStart ? 'ok' : 'bad'} />
      <Tile l="Yangi faol bo‘ldi" v={st.newActive.length} d="birinchi to‘lovni qildi" onClick={() => show('Yangi faol bo‘lganlar', st.newActive)} />
      <Tile l="Ketdi (arxiv)" v={st.left.length} d={st.churnPct === null ? 'faollardan ketish —' : `faollardan ketish ${st.churnPct}%`} tone={st.left.length ? 'bad' : undefined} onClick={() => show('Ketganlar', st.left)} />
      <Tile l="To‘lov kutilyapti" v={st.waiting.length} d="qo‘shilgan, hali to‘lamagan · hozir" onClick={() => show('To‘lov kutilyotganlar', st.waiting)} />
      <Tile l="Muzlatilgan" v={st.frozen.length} d="hozir" onClick={() => show('Muzlatilganlar', st.frozen)} />
      <Tile l="O‘rtacha o‘qish muddati" v={st.avgMonths === null ? '—' : `${st.avgMonths} oy`} d="oxirgi 12 oyda ketganlar bo‘yicha" />
      <Tile l="Bir o‘quvchidan o‘rtacha tushum" v={st.avgRevenue === null ? '—' : som(st.avgRevenue)} d="to‘lagan o‘quvchilar, butun davr" />
      <Tile l="Davomat" v={st.attendancePct === null ? '—' : `${st.attendancePct}%`} d="belgilangan darslar, sinovsiz" />

      <Section>Pul</Section>
      <Tile l="Kutilgan tushum" v={som(mo.expected)} d="faollarning oylik to‘lovi (chegirmadan keyin)" />
      <Tile l="Yig‘ildi" v={som(mo.collected)} d={mo.collectedPct === null ? '' : `${mo.collectedPct}% yig‘ildi`} tone={mo.collectedPct !== null && mo.collectedPct >= 90 ? 'ok' : undefined} bar={mo.collectedPct} />
      <Tile l="Jami qarz (hozir)" v={som(mo.debt)} d={`${mo.debtors.length} qarzdor · ${mo.bigDebtors} tasida 1 oylikdan ko‘p`} tone={mo.debt ? 'bad' : undefined} onClick={() => show('Qarzdorlar', mo.debtors)} />
      <Tile l="Keyingi oy prognozi" v={som(mo.forecast)} d="faollar + to‘lov kutilyotganlar oylik summasi" />

      {open && (
        <div className="sx-card s12">
          <div className="sx-h">
            <h3>
              {open.title} · {open.items.length}
            </h3>
            <span className="flex-1" />
            <button className="sx-btn sm" onClick={() => setOpen(null)} aria-label="Yopish">
              <X className="size-4" />
            </button>
          </div>
          {open.items.length ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-1.5 text-[13px]">
              {open.items.map((i) => (
                <li key={i.id} className="flex min-w-0 justify-between gap-2 border-b border-au-line py-1">
                  <span className="truncate text-au-ink">{i.name}</span>
                  {i.note && <span className="shrink-0 text-au-faint">{i.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-au-faint">Bo‘sh</div>
          )}
        </div>
      )}

      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Lid → o‘quvchi voronkasi</h3>
          <small>{mLabel(h.month)} da kelgan lidlar</small>
        </div>
        {f.leads ? (
          <div className="flex flex-col gap-2">
            {(
              [
                ['Yangi lid', f.leads],
                ['Sinovga yozildi', f.trial],
                ['O‘quvchi bo‘ldi', f.converted],
                ['To‘ladi (faol)', f.paid],
              ] as const
            ).map(([n, v]) => (
              <div key={n} className="grid grid-cols-[110px_1fr_48px] items-center gap-2.5 text-[13px]">
                <span className="text-au-ink">{n}</span>
                <span className="sx-hb">
                  <i className="bg-au-accent" style={{ width: `${(v / f.leads) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-au-muted">
                  {v} · {Math.round((v / f.leads) * 100)}%
                </span>
              </div>
            ))}
            <div className="text-xs text-au-faint">
              Lid kelgandan birinchi to‘lovgacha o‘rtacha: <b className="text-au-ink">{f.avgDays === null ? '—' : `${f.avgDays} kun`}</b>
              {f.lost.length > 0 && (
                <>
                  {' '}· yo‘qotish sabablari: {f.lost.map((l) => `${l.reason} (${l.n})`).join(', ')}
                </>
              )}
            </div>
            <table className="mt-1 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-au-faint">
                  <th className="py-1 font-bold">Manba</th>
                  <th className="py-1 text-right font-bold">Lid</th>
                  <th className="py-1 text-right font-bold">To‘ladi</th>
                  <th className="py-1 text-right font-bold">Konversiya</th>
                </tr>
              </thead>
              <tbody>
                {f.sources.map((s) => (
                  <tr key={s.source} className="border-t border-au-line">
                    <td className="py-1.5 text-au-ink">{s.source}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.leads}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.paid}</td>
                    <td className="py-1.5 text-right tabular-nums">{Math.round((s.paid / s.leads) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-au-faint">Bu oyda lid yo‘q</div>
        )}
      </div>

      <div className="sx-card s6">
        <div className="sx-h">
          <h3>6 oylik dinamika</h3>
          <small>ustun: oy oxirida faol · raqam: yig‘ilgan tushum</small>
        </div>
        <div className="flex h-44 items-end gap-2">
          {h.trend.map((t) => (
            <div key={t.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${mLabel(t.month)} · ${t.active} faol · ${som(t.collected)}`}>
              <span className="text-[11px] font-bold tabular-nums text-au-ink">{t.active}</span>
              <i className={cn('block w-full rounded-t-md', t.month === h.month ? 'bg-au-accent' : 'bg-au-accent-soft')} style={{ height: `${Math.max(3, (t.active / tMax) * 70)}%` }} />
              <i className="block w-full rounded-sm bg-au-info-soft" style={{ height: `${Math.max(2, (t.collected / cMax) * 18)}%` }} />
              <span className="text-[10px] tabular-nums text-au-muted">{mln(t.collected)}</span>
              <span className="text-[10px] text-au-faint">{mShort(t.month)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Kohort: faol bo‘lgan oyi bo‘yicha qolganlar</h3>
        </div>
        <table className="w-full text-center text-[13px] tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-au-faint">
              <th className="py-1 text-left font-bold">Oy</th>
              <th className="py-1 font-bold">Soni</th>
              {[1, 2, 3, 4].map((k) => (
                <th key={k} className="py-1 font-bold">
                  {k}-oy
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.cohorts.map((c) => (
              <tr key={c.month} className="border-t border-au-line">
                <td className="py-1.5 text-left font-semibold text-au-ink">{mLabel(c.month)}</td>
                <td className="py-1.5">{c.n}</td>
                {c.kept.map((k, i) => (
                  <td key={i} className={cn('py-1.5', k === null ? 'text-au-faint' : k >= 80 ? 'bg-au-ok-soft text-au-ok' : k >= 60 ? 'bg-au-accent-soft text-au-accent-text' : 'bg-au-bad-soft text-au-bad')}>
                    {k === null ? '—' : `${k}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-xs text-au-faint">Masalan «2-oy 75%»: o‘sha oyda faol bo‘lganlarning 75% i 2 oydan keyin ham o‘qiyapti. «—»: hali 2 oy o‘tmagan.</div>
      </div>

      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Guruhlar to‘lishi</h3>
          <small>faol guruhlar · hozir</small>
        </div>
        {h.groups.length ? (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {h.groups.map((g) => {
              const p = g.limit > 0 ? g.students / g.limit : 0;
              return (
                <div key={g.name} className="grid grid-cols-[minmax(0,1fr)_64px_minmax(70px,30%)] items-center gap-2.5 text-[13px]">
                  <span className="truncate text-au-ink">{g.name}</span>
                  <span className="text-right tabular-nums text-au-muted">
                    {g.students} / {g.limit}
                  </span>
                  <span className="sx-hb">
                    <i className={p >= 0.8 ? 'bg-au-ok' : p >= 0.5 ? 'bg-au-accent' : 'bg-au-bad'} style={{ width: `${Math.min(100, p * 100)}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-au-faint">Faol guruh yo‘q</div>
        )}
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Ma’lumot to‘liqligi</h3>
          <small>statistika aniq bo‘lishi uchun to‘ldirilishi kerak · bosing: ro‘yxat</small>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
          {h.gaps.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => show(g.label, g.items)}
              className="flex items-center justify-between gap-2 rounded-xl border border-au-line px-3 py-2.5 text-left text-[13px] hover:border-au-accent"
            >
              <span className="text-au-ink">{g.label}</span>
              <span className={cn('sx-pl', g.items.length ? 'bad' : 'ok')}>{g.items.length}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="s12 -mb-1 mt-1 text-xs font-extrabold uppercase tracking-wider text-au-faint">{children}</div>
);

function Tile({ l, v, d, tone, bar, onClick }: { l: string; v: React.ReactNode; d?: string; tone?: 'ok' | 'bad'; bar?: number | null; onClick?: () => void }) {
  const body = (
    <>
      <div className="l">{l}</div>
      <div className="v" style={{ color: tone === 'bad' ? 'var(--au-bad)' : undefined }}>
        {typeof v === 'number' ? formatUZS(v) : v}
      </div>
      {bar !== undefined && bar !== null && (
        <span className="sx-hb mt-1">
          <i className="bg-au-accent" style={{ width: `${Math.min(100, bar)}%` }} />
        </span>
      )}
      {d && <div className="d">{d}</div>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="sx-card sx-stat s3 text-left transition-colors hover:border-au-accent">
      {body}
    </button>
  ) : (
    <div className="sx-card sx-stat s3">{body}</div>
  );
}
