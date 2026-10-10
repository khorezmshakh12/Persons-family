'use client';

import { useEffect, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Lock, LockOpen, Loader2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { closePeriodAction, getClosePeriodAction, markBudgetReviewedAction, reopenPeriodAction } from '@/lib/actions/accounting';
import type { ClosePeriod } from '@/lib/acct-close';
import { toast } from './suite-shell';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const label = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const ERR: Record<string, string> = {
  blocked: 'Yopib bo‘lmaydi — qizil bandlarni hal qiling',
  alreadyClosed: 'Oy allaqachon yopilgan',
  notClosed: 'Oy yopilmagan',
  reasonRequired: 'Sababni yozing (kamida 3 belgi)',
  forbidden: 'Ruxsat yo‘q',
};

/** Month close: the checklist, then a DB-enforced lock (reopen with a reason). */
export function AccountingClose({ ym }: { ym: string }) {
  const router = useRouter();
  const [p, setP] = useState<ClosePeriod | null>(null);
  const [busy, start] = useTransition();
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const load = () =>
    start(async () => {
      const res = await getClosePeriodAction(ym);
      if (res.error || !res.period) return void toast.error('Yuklab bo‘lmadi');
      setP(res.period);
    });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the month changes
  }, [ym]);

  const act = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) return void toast.error(ERR[res.error] ?? 'Saqlab bo‘lmadi');
      toast.success(ok);
      setReason('');
      setReopening(false);
      const fresh = await getClosePeriodAction(ym);
      if (fresh.period) setP(fresh.period);
      router.refresh();
    });

  if (!p) return <div className="sx-card s12 sx-empty"><Loader2 className="mx-auto size-5 animate-spin" /></div>;
  const blockers = p.checks.filter((c) => c.blocking && !c.ok).length;
  const done = p.checks.filter((c) => c.ok).length;

  return (
    <div className="sx-grid">
      <div className={cn('sx-card sx-stat s4', p.closed && 'dark')}>
        <div className="l">{label(ym)}</div>
        <div className="v flex items-center gap-2">{p.closed ? <><Lock className="size-6" /> Yopilgan</> : <><LockOpen className="size-6" /> Ochiq</>}</div>
        <div className="d">{p.closed ? `${p.closedBy ?? ''} · ${p.closedAt?.slice(0, 10)}` : 'jurnalga yozish mumkin'}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Tekshiruvlar</div>
        <div className="v">
          {done} / {p.checks.length}
        </div>
        <div className="d">{blockers ? `${blockers} ta to‘siq` : 'to‘siq yo‘q'}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Harakat</div>
        {p.closed ? (
          reopening ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <input className="sx-inp !h-[32px]" placeholder="Qayta ochish sababi" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <div className="flex gap-1.5">
                <button className="sx-btn sm text-au-bad" disabled={busy || reason.trim().length < 3} onClick={() => act(() => reopenPeriodAction(ym, reason), 'Oy qayta ochildi')}>
                  Qayta ochish
                </button>
                <button className="sx-btn sm" onClick={() => setReopening(false)}>
                  Bekor
                </button>
              </div>
            </div>
          ) : (
            <button className="sx-btn sm mt-2 w-fit" onClick={() => setReopening(true)}>
              <LockOpen className="size-3.5" /> Oyni qayta ochish
            </button>
          )
        ) : (
          <button className="sx-btn primary sm mt-2 w-fit" disabled={busy || blockers > 0} onClick={() => act(() => closePeriodAction(ym), `${label(ym)} yopildi`)} title={blockers ? 'Avval qizil bandlarni hal qiling' : undefined}>
            <Lock className="size-3.5" /> Oyni yopish
          </button>
        )}
      </div>

      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Oy yopish ro‘yxati</h3>
          <small>yopilgan oyda jurnal o‘zgarmaydi — ma’lumotlar bazasi darajasida</small>
        </div>
        <ul className="flex flex-col divide-y divide-au-line">
          {p.checks.map((c, i) => (
            <li key={c.key} className="flex items-start gap-3 py-2.5" style={{ animationDelay: `${i * 40}ms` }}>
              {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-au-ok" /> : c.blocking ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-au-bad" /> : <Circle className="mt-0.5 size-4 shrink-0 text-au-muted" />}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">
                  {c.n}
                  {c.blocking && !c.ok && <span className="sx-pl bad ml-2">majburiy</span>}
                </span>
                <span className="text-xs text-au-muted">{c.detail}</span>
              </div>
              {c.key === 'budget' && !p.closed && (
                <button className="sx-btn sm shrink-0" disabled={busy} onClick={() => act(() => markBudgetReviewedAction(ym, !p.budgetReview), p.budgetReview ? 'Belgi olindi' : 'Belgilandi')}>
                  {p.budgetReview ? 'Belgini olish' : 'Ko‘rib chiqdim'}
                </button>
              )}
              {c.href && !c.ok && (
                <Link href={c.href} className="sx-btn sm shrink-0">
                  Ochish
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Jurnal</h3>
        </div>
        {p.log.length === 0 ? (
          <div className="sx-empty">Hali harakat yo‘q</div>
        ) : (
          <ol className="flex flex-col gap-2 text-xs">
            {p.log.map((l, i) => (
              <li key={i} className="border-l-2 border-au-line pl-2">
                <b>{l.action === 'close' ? 'Yopildi' : l.action === 'reopen' ? 'Qayta ochildi' : 'Budjet ko‘rib chiqildi'}</b>
                <span className="block text-au-muted">
                  {l.actor ?? '—'} · {l.at.slice(0, 16).replace('T', ' ')}
                  {l.reason ? ` · “${l.reason}”` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
