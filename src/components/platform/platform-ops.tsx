'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, GitCommit, History, ListChecks, Undo2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, SURFACE_CARD } from '@/lib/glass';
import { revertPlatformChangeAction } from '@/lib/actions/platform';
import type { Health, JournalRow, QualityIssue } from '@/lib/platform-health';

const fmt = (s: string | null) => (s ? new Date(new Date(s).getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : '—');
const ago = (s: string | null, t: ReturnType<typeof useTranslations>) => {
  if (!s) return t('never');
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60_000);
  return m < 60 ? t('minAgo', { n: m }) : m < 1440 ? t('hAgo', { n: Math.round(m / 60) }) : t('dAgo', { n: Math.round(m / 1440) });
};

function Card({ title, icon, children, i = 0 }: { title: string; icon: React.ReactNode; children: React.ReactNode; i?: number }) {
  return (
    <section style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4 sm:p-5')}>
      <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
        <span className="text-au-muted">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function HealthPanel({ h }: { h: Health }) {
  const bad = h.crons.filter((c) => c.stale || c.ok === false).length;
  const t = useTranslations('po');
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { n: t('version'), v: h.revision.replace('persons-staff-app-', ''), icon: <GitCommit className="size-4" /> },
          { n: t('cronBad'), v: String(bad), icon: <Clock3 className="size-4" />, tone: bad ? 'text-au-bad' : 'text-au-ok' },
          { n: t('clientErr'), v: String(h.clientErrors24h), icon: <AlertTriangle className="size-4" />, tone: h.clientErrors24h > 20 ? 'text-au-bad' : '' },
          { n: t('db'), v: h.dbConnections === null || h.dbConnections < 0 ? '—' : String(h.dbConnections), icon: <Database className="size-4" /> },
        ].map((k, i) => (
          <div key={k.n} style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-1 p-4')}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
              {k.icon} {k.n}
            </span>
            <span className={cn('truncate text-xl font-bold tabular-nums', k.tone)}>{k.v}</span>
          </div>
        ))}
      </div>
      <Card title={t('cron')} icon={<Activity className="size-4" />} i={1}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-wide text-au-muted uppercase">
                <th className="py-2">{t('job')}</th>
                <th className="py-2">{t('schedule')}</th>
                <th className="py-2">{t('lastRun')}</th>
                <th className="py-2 text-right">{t('d7')}</th>
                <th className="py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {h.crons.map((c) => (
                <tr key={c.job} className="border-t border-au-line" title={c.detail ?? undefined}>
                  <td className="py-2 font-semibold">{c.n}</td>
                  <td className="py-2 text-au-muted">{c.every}</td>
                  <td className="py-2 tabular-nums">{ago(c.last, t)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.runs7d}
                    {c.fails7d > 0 && <span className="text-au-bad">{t('fails', { n: c.fails7d })}</span>}
                  </td>
                  <td className="py-2">
                    {c.ok === false ? (
                      <span className={CHIP_BAD}>{t('err')}</span>
                    ) : c.stale ? (
                      <span className={CHIP_NEUTRAL}>{c.last ? t('late') : t('noLog')}</span>
                    ) : (
                      <span className={CHIP_OK}>
                        <CheckCircle2 className="size-3" /> {t('ok')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-au-muted">{t('logHint')}</p>
      </Card>
      <Card title={t('topErr')} icon={<AlertTriangle className="size-4" />} i={2}>
        {h.topErrors.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-au-ok">
            <CheckCircle2 className="size-4" /> {t('noErr')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {h.topErrors.map((e) => (
              <li key={e.message} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words text-au-ink">{e.message.slice(0, 160)}</span>
                <span className={CHIP_NEUTRAL}>{e.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function QualityPanel({ issues }: { issues: QualityIssue[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const t = useTranslations('po');
  return (
    <Card title={t('quality')} icon={<ListChecks className="size-4" />}>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-au-ok">
          <CheckCircle2 className="size-4" /> {t('allFull')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-au-line">
          {issues.map((q) => (
            <li key={q.key} className="flex flex-col gap-1.5 py-2.5">
              <button className="flex items-center justify-between gap-2 text-left" onClick={() => setOpen(open === q.key ? null : q.key)}>
                <span className="text-sm font-semibold">{q.n}</span>
                <span className={CHIP_BAD}>{q.people.length}</span>
              </button>
              {open === q.key && (
                <div className="ms-pop-in flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1">
                    {q.people.map((p) => (
                      <Link key={p.id} href={`/profile/${p.id}`} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')}>
                        {p.name}
                      </Link>
                    ))}
                  </div>
                  <Link href={q.href} className="text-xs font-semibold text-au-accent-text hover:underline">
                    {t('fix', { f: q.fix })}
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const SECTION_N: Record<string, string> = { default: 'byRole', allow: 'open', deny: 'closed' };

export function JournalPanel({ rows }: { rows: JournalRow[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const t = useTranslations('po');
  const sn = (v: string | null) => (SECTION_N[v ?? ''] ? t(SECTION_N[v ?? '']) : (v ?? ''));
  const revert = (id: string) =>
    start(async () => {
      const res = await revertPlatformChangeAction(id);
      if (res?.error) return void toast.error(res.error === 'alreadyReverted' ? t('already') : t('revertFail'));
      toast.success(t('reverted'));
      router.refresh();
    });
  return (
    <Card title={t('journal')} icon={<History className="size-4" />}>
      {rows.length === 0 ? (
        <p className="text-sm text-au-muted">{t('noRows')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id} style={{ ['--i' as string]: Math.min(i, 12) }} className="ms-rise flex items-start gap-3 border-l-2 border-au-line pl-3">
              <div className="flex min-w-0 flex-1 flex-col">
                {r.kind === 'section_access' ? (
                  <span className="text-sm">
                    {t.rich('secRow', { t: r.target ?? '', k: r.key, a: sn(r.before), b2: sn(r.after), b: (c) => <b>{c}</b> })}
                  </span>
                ) : r.kind === 'role_access' ? (
                  <span className="text-sm">
                    {t.rich('roleRow', { r: r.key.split('|')[0], k: r.key.split('|')[1], a: sn(r.before), b2: sn(r.after), b: (c) => <b>{c}</b> })}
                  </span>
                ) : (
                  <span className="text-sm break-words">
                    <span className={cn(CHIP_NEUTRAL, 'mr-1.5')}>{r.kind}</span>
                    {r.key.slice(0, 200)}
                  </span>
                )}
                <span className="text-[11px] text-au-muted">
                  {r.actor ?? t('system')} · {fmt(r.at)}
                </span>
              </div>
              {(r.kind === 'section_access' || r.kind === 'role_access') &&
                (r.reverted ? (
                  <span className={CHIP_NEUTRAL}>{t('revertedChip')}</span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => revert(r.id)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-au-ctl border border-au-line px-2 text-xs font-semibold hover:bg-au-card-2"
                  >
                    <Undo2 className="size-3.5" /> {t('revert')}
                  </button>
                ))}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
