'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, GitCommit, History, ListChecks, Undo2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, SURFACE_CARD } from '@/lib/glass';
import { revertPlatformChangeAction } from '@/lib/actions/platform';
import type { Health, JournalRow, QualityIssue } from '@/lib/platform-health';

const fmt = (s: string | null) => (s ? new Date(new Date(s).getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : '—');
const ago = (s: string | null) => {
  if (!s) return 'hech qachon';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60_000);
  return m < 60 ? `${m} daq oldin` : m < 1440 ? `${Math.round(m / 60)} soat oldin` : `${Math.round(m / 1440)} kun oldin`;
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
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { n: 'Joriy versiya', v: h.revision.replace('persons-staff-app-', ''), icon: <GitCommit className="size-4" /> },
          { n: 'Cron muammolari', v: String(bad), icon: <Clock3 className="size-4" />, tone: bad ? 'text-au-bad' : 'text-au-ok' },
          { n: 'Brauzer xatolari (24 soat)', v: String(h.clientErrors24h), icon: <AlertTriangle className="size-4" />, tone: h.clientErrors24h > 20 ? 'text-au-bad' : '' },
          { n: 'Baza ulanishlari', v: h.dbConnections === null || h.dbConnections < 0 ? '—' : String(h.dbConnections), icon: <Database className="size-4" /> },
        ].map((k, i) => (
          <div key={k.n} style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-1 p-4')}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
              {k.icon} {k.n}
            </span>
            <span className={cn('truncate text-xl font-bold tabular-nums', k.tone)}>{k.v}</span>
          </div>
        ))}
      </div>
      <Card title="Fon jarayonlari (cron)" icon={<Activity className="size-4" />} i={1}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-wide text-au-muted uppercase">
                <th className="py-2">Jarayon</th>
                <th className="py-2">Jadval</th>
                <th className="py-2">Oxirgi ishga tushish</th>
                <th className="py-2 text-right">7 kun</th>
                <th className="py-2">Holat</th>
              </tr>
            </thead>
            <tbody>
              {h.crons.map((c) => (
                <tr key={c.job} className="border-t border-au-line" title={c.detail ?? undefined}>
                  <td className="py-2 font-semibold">{c.n}</td>
                  <td className="py-2 text-au-muted">{c.every}</td>
                  <td className="py-2 tabular-nums">{ago(c.last)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.runs7d}
                    {c.fails7d > 0 && <span className="text-au-bad"> / {c.fails7d} xato</span>}
                  </td>
                  <td className="py-2">
                    {c.ok === false ? (
                      <span className={CHIP_BAD}>Xato</span>
                    ) : c.stale ? (
                      <span className={CHIP_NEUTRAL}>{c.last ? 'Kechikmoqda' : 'Hali qayd yo‘q'}</span>
                    ) : (
                      <span className={CHIP_OK}>
                        <CheckCircle2 className="size-3" /> Ishlayapti
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-au-muted">Qayd yangi versiyadan boshlab yig‘iladi — birinchi kunlarda “Hali qayd yo‘q” ko‘rinishi normal.</p>
      </Card>
      <Card title="Ko‘p uchragan brauzer xatolari (24 soat)" icon={<AlertTriangle className="size-4" />} i={2}>
        {h.topErrors.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-au-ok">
            <CheckCircle2 className="size-4" /> Xato yo‘q
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
  return (
    <Card title="Ma’lumot sifati" icon={<ListChecks className="size-4" />}>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-au-ok">
          <CheckCircle2 className="size-4" /> Hamma ma’lumot to‘liq
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
                    Tuzatish: {q.fix} →
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

const SECTION_N: Record<string, string> = { default: 'rol bo‘yicha', allow: 'ochiq', deny: 'yopiq' };

export function JournalPanel({ rows }: { rows: JournalRow[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const revert = (id: string) =>
    start(async () => {
      const res = await revertPlatformChangeAction(id);
      if (res?.error) return void toast.error(res.error === 'alreadyReverted' ? 'Allaqachon qaytarilgan' : 'Qaytarib bo‘lmadi');
      toast.success('O‘zgarish qaytarildi');
      router.refresh();
    });
  return (
    <Card title="O‘zgarishlar jurnali" icon={<History className="size-4" />}>
      {rows.length === 0 ? (
        <p className="text-sm text-au-muted">Hali yozuv yo‘q</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id} style={{ ['--i' as string]: Math.min(i, 12) }} className="ms-rise flex items-start gap-3 border-l-2 border-au-line pl-3">
              <div className="flex min-w-0 flex-1 flex-col">
                {r.kind === 'section_access' ? (
                  <span className="text-sm">
                    <b>{r.target}</b>: «{r.key}» bo‘limi {SECTION_N[r.before ?? ''] ?? r.before} → <b>{SECTION_N[r.after ?? ''] ?? r.after}</b>
                  </span>
                ) : (
                  <span className="text-sm break-words">
                    <span className={cn(CHIP_NEUTRAL, 'mr-1.5')}>{r.kind}</span>
                    {r.key.slice(0, 200)}
                  </span>
                )}
                <span className="text-[11px] text-au-muted">
                  {r.actor ?? 'Tizim'} · {fmt(r.at)}
                </span>
              </div>
              {r.kind === 'section_access' &&
                (r.reverted ? (
                  <span className={CHIP_NEUTRAL}>Qaytarilgan</span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => revert(r.id)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-au-ctl border border-au-line px-2 text-xs font-semibold hover:bg-au-card-2"
                  >
                    <Undo2 className="size-3.5" /> Qaytarish
                  </button>
                ))}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
