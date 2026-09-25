'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { fmtDay, type StrategyPerson } from '@/lib/strategy';
import { deleteRiskAction, saveRiskAction } from '@/lib/actions/perforce';
import { riskLevel, riskScore, riskSummary, type Risk, type RiskStatus } from '@/lib/perforce';
import { toast } from './suite-shell';
import { PersonAvatar } from './bits';

type RiskCat = 'strategic' | 'operational' | 'financial' | 'compliance' | 'people' | 'technology';
type RiskTreat = 'avoid' | 'reduce' | 'transfer' | 'accept';
export type RiskRow = Risk & {
  space_id: string | null;
  title: string;
  category: RiskCat;
  treatment: RiskTreat;
  mitigation: string;
  owner_id: string | null;
  updated_at: string;
};

const RCAT: Record<RiskCat, string> = {
  strategic: 'Strategik',
  operational: 'Operatsion',
  financial: 'Moliyaviy',
  compliance: 'Muvofiqlik',
  people: 'Kadrlar',
  technology: 'Texnologik',
};
const RTREAT: Record<RiskTreat, string> = { avoid: 'Oldini olish', reduce: 'Kamaytirish', transfer: 'O‘tkazish', accept: 'Qabul qilish' };
const RSTAT: Record<RiskStatus, [string, string]> = {
  open: ['Ochiq', 'warn'],
  monitoring: ['Monitoring', 'ok'],
  closed: ['Yopilgan', ''],
  occurred: ['Yuz berdi', 'bad'],
};
const RLVL = {
  low: ['Past', 'var(--au-ok)'],
  medium: ['O‘rta', '#ffc46b'],
  high: ['Yuqori', '#ff9f1c'],
  critical: ['Kritik', 'var(--au-bad)'],
} as const;
type RiskForm = Omit<RiskRow, 'id' | 'updated_at'> & { id?: string };
const EMPTY: RiskForm = {
  space_id: null,
  title: '',
  category: 'operational',
  likelihood: 3,
  impact: 3,
  treatment: 'reduce',
  mitigation: '',
  owner_id: null,
  review_date: null,
  status: 'open',
  postmortem: '',
};
const ERR = (c: string) => (c === 'forbidden' ? "Ruxsat yo'q" : c === 'invalidInput' ? "Ma'lumot noto'g'ri" : "Saqlab bo'lmadi");
const live = (s: RiskStatus) => s === 'open' || s === 'monitoring';

/** ISO 31000 risk register (5×5 likelihood × impact heat map, treatment,
 * owner, review date) with a post-mortem once a risk has materialised. */
export function RiskRegister({
  risks,
  spaces,
  people,
  personById,
  today,
}: {
  risks: RiskRow[];
  spaces: { id: string; name: string }[];
  people: StrategyPerson[];
  personById: Map<string, StrategyPerson>;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<RiskForm | null>(null);
  const act = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) return void toast.error(ERR(r.error));
      toast.success(ok);
      setF(null);
      router.refresh();
    });
  const sum = riskSummary(risks, today);
  const rows = [...risks].sort((a, b) => Number(live(b.status)) - Number(live(a.status)) || riskScore(b) - riskScore(a));
  const save = (v: RiskForm) =>
    act(
      () =>
        saveRiskAction({
          id: v.id,
          spaceId: v.space_id,
          title: v.title,
          category: v.category,
          likelihood: v.likelihood,
          impact: v.impact,
          treatment: v.treatment,
          mitigation: v.mitigation,
          ownerId: v.owner_id,
          reviewDate: v.review_date || null,
          status: v.status,
          postmortem: v.postmortem,
        }),
      v.id ? 'Risk saqlandi' : "Risk qo'shildi",
    );
  const sel = (label: string, value: string | number, opts: [string | number, string][], on: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
      {label}
      <select className="sx-inp !h-[32px]" value={value} onChange={(e) => on(e.target.value)}>
        {opts.map(([k, n]) => (
          <option key={k} value={k}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  const scale: [number, string][] = [1, 2, 3, 4, 5].map((n) => [n, String(n)]);
  const lvF = f ? RLVL[riskLevel(f.likelihood * f.impact)] : null;

  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>ISO 31000 Risk registri & Post-mortem</h3>
        <small>ehtimollik × ta’sir (5×5) · davolash · egasi · qayta ko‘rib chiqish</small>
        <span className="sp" />
        <button className="sx-btn sm" disabled={pending} onClick={() => setF({ ...EMPTY })}>
          + Risk
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div>
          <div className="grid grid-cols-[18px_repeat(5,34px)] gap-1 text-center text-[11px]">
            {[5, 4, 3, 2, 1].map((imp) => (
              <Fragment key={imp}>
                <span className="self-center text-au-muted">{imp}</span>
                {[1, 2, 3, 4, 5].map((lk) => {
                  const n = sum.matrix[imp - 1][lk - 1];
                  const lv = riskLevel(imp * lk);
                  return (
                    <span
                      key={lk}
                      className="grid h-[34px] place-items-center rounded-md font-bold tabular-nums"
                      style={{ background: RLVL[lv][1], opacity: n ? 1 : 0.25, color: lv === 'medium' ? '#17161a' : '#fff' }}
                      title={`Ta’sir ${imp} × ehtimollik ${lk} = ${imp * lk}`}
                    >
                      {n || ''}
                    </span>
                  );
                })}
              </Fragment>
            ))}
            <span />
            {[1, 2, 3, 4, 5].map((lk) => (
              <span key={lk} className="text-au-muted">
                {lk}
              </span>
            ))}
          </div>
          <div className="mt-1 text-center text-[11px] text-au-muted">↑ ta’sir · ehtimollik →</div>
        </div>
        <div className="flex flex-wrap content-start gap-2 text-sm">
          <span className="sx-pl">{sum.live} faol risk</span>
          {(['critical', 'high', 'medium', 'low'] as const).map((k) => (
            <span key={k} className="sx-pl" style={{ color: RLVL[k][1] }}>
              {RLVL[k][0]}: {sum.by[k]}
            </span>
          ))}
          <span className={cn('sx-pl', sum.overdue ? 'bad' : 'ok')}>{sum.overdue} ko‘rib chiqish muddati o‘tgan</span>
          <span className={cn('sx-pl', sum.pmDue ? 'warn' : 'ok')}>{sum.pmDue} post-mortem kutilmoqda</span>
        </div>
      </div>

      {f && lvF && (
        <div className="mt-4 grid gap-2 rounded-xl border border-au-line p-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted sm:col-span-2">
            Risk
            <input className="sx-inp !h-[32px]" maxLength={300} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          {sel('Loyiha', f.space_id ?? '', [['', '—'], ...spaces.map((s): [string, string] => [s.id, s.name])], (v) => setF({ ...f, space_id: v || null }))}
          {sel('Toifa', f.category, Object.entries(RCAT), (v) => setF({ ...f, category: v as RiskCat }))}
          {sel('Ehtimollik (1–5)', f.likelihood, scale, (v) => setF({ ...f, likelihood: +v }))}
          {sel('Ta’sir (1–5)', f.impact, scale, (v) => setF({ ...f, impact: +v }))}
          {sel('Davolash', f.treatment, Object.entries(RTREAT), (v) => setF({ ...f, treatment: v as RiskTreat }))}
          {sel('Holat', f.status, Object.entries(RSTAT).map(([k, [n]]): [string, string] => [k, n]), (v) => setF({ ...f, status: v as RiskStatus }))}
          {sel('Egasi', f.owner_id ?? '', [['', '—'], ...people.map((p): [string, string] => [p.id, `${p.first_name} ${p.last_name}`])], (v) =>
            setF({ ...f, owner_id: v || null }),
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Qayta ko‘rib chiqish
            <input className="sx-inp !h-[32px]" type="date" value={f.review_date ?? ''} onChange={(e) => setF({ ...f, review_date: e.target.value || null })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted sm:col-span-2">
            Choralar (mitigatsiya)
            <textarea className="sx-inp !h-[64px] py-1" maxLength={2000} value={f.mitigation} onChange={(e) => setF({ ...f, mitigation: e.target.value })} />
          </label>
          {(f.status === 'occurred' || f.status === 'closed' || f.postmortem) && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted sm:col-span-4">
              Post-mortem — nima bo‘ldi, ildiz sababi, xulosa va keyingi choralar
              <textarea className="sx-inp !h-[90px] py-1" maxLength={4000} value={f.postmortem} onChange={(e) => setF({ ...f, postmortem: e.target.value })} />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
            <span className="text-xs text-au-muted">
              Ball: <b>{f.likelihood * f.impact}</b> · <b style={{ color: lvF[1] }}>{lvF[0]}</b>
            </span>
            <span className="flex-1" />
            {f.id && (
              <button
                className="sx-btn sm text-au-bad"
                disabled={pending}
                onClick={() => {
                  const id = f.id!;
                  if (window.confirm("Risk o'chirilsinmi?")) act(() => deleteRiskAction(id), "Risk o'chirildi");
                }}
              >
                O‘chirish
              </button>
            )}
            <button className="sx-btn sm" onClick={() => setF(null)}>
              Bekor
            </button>
            <button className="sx-btn primary sm" disabled={pending || !f.title.trim()} onClick={() => save(f)}>
              Saqlash
            </button>
          </div>
        </div>
      )}

      <div className="sx-tw mt-4">
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">Risk</th>
              <th>Toifa</th>
              <th>E × T</th>
              <th>Daraja</th>
              <th>Davolash</th>
              <th>Egasi</th>
              <th>Ko‘rib chiqish</th>
              <th>Holat</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="l">
                  <div className="sx-empty">Risk qo‘shing — 5×5 xarita, egasi va post-mortem shu yerda yuritiladi.</div>
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const sc = riskScore(r);
              const lv = RLVL[riskLevel(sc)];
              const late = !!r.review_date && r.review_date < today && live(r.status);
              return (
                <tr key={r.id} className="cursor-pointer" onClick={() => setF({ ...r })}>
                  <td className="l">
                    <b>{r.title}</b>
                    {r.status === 'occurred' && !r.postmortem.trim() && <span className="sx-pl warn ml-2">post-mortem yo‘q</span>}
                  </td>
                  <td>{RCAT[r.category]}</td>
                  <td className="tabular-nums">
                    {r.likelihood}×{r.impact} = <b>{sc}</b>
                  </td>
                  <td>
                    <b style={{ color: lv[1] }}>{lv[0]}</b>
                  </td>
                  <td>{RTREAT[r.treatment]}</td>
                  <td>{r.owner_id ? <PersonAvatar person={personById.get(r.owner_id)} size={22} /> : '—'}</td>
                  <td style={{ color: late ? 'var(--au-bad)' : undefined }}>{r.review_date ? fmtDay(r.review_date) : '—'}</td>
                  <td>
                    <span className={cn('sx-pl', RSTAT[r.status][1])}>{RSTAT[r.status][0]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
