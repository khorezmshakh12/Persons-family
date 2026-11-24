'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Check, Clock, Plus, ShieldCheck, X } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { approvePositionRequestAction, rejectPositionRequestAction, requestPositionAction } from '@/lib/actions/position-requests';

type Rung = { role: string; dept: string; label: string };
type Req = { role: string; status: string };
type QueueItem = { id: string; name: string; role: string; label: string };

/** HR rivojlanish yo'li: lavozim pog'onasi — har kim o'ziga lavozim so'raydi
 * (CEO dan boshqa), CEO tasdiqlaydi. Tasdiqlangandan keyin faollashadi. */
export function CareerRoadmap({
  ladder,
  deptLabels,
  held,
  requests,
  isCeo,
  queue,
}: {
  ladder: Rung[];
  deptLabels: Record<string, string>;
  held: string[];
  requests: Req[];
  isCeo: boolean;
  queue: QueueItem[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const t = useTranslations('cr');
  const reqOf = (role: string) => requests.find((r) => r.role === role && r.status === 'pending');

  const run = (fn: () => Promise<{ error: string } | { ok: true }>, okMsg: string) =>
    start(async () => {
      setMsg('');
      const res = await fn();
      setMsg('ok' in res ? okMsg : t('error', { e: res.error }));
    });

  // Pog'onani bo'lim bo'yicha guruhlash (dept tartibini saqlab).
  const depts: string[] = [];
  ladder.forEach((r) => { if (!depts.includes(r.dept)) depts.push(r.dept); });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-au-ink">{t('title')}</h2>
        <p className="text-sm text-au-muted">{t('sub')}</p>
        {msg && <p className="mt-1 text-xs text-au-muted">{msg}</p>}
      </div>

      {isCeo && queue.length > 0 && (
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
          <div className="flex items-center gap-2 text-sm font-bold text-au-ink">
            <ShieldCheck className="size-4 text-au-accent-text" /> {t('queue', { n: queue.length })}
          </div>
          {queue.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-3 rounded-au-ctl border border-au-line p-3">
              <span className="flex-1 text-sm">
                <b className="text-au-ink">{q.name}</b> → <b className="text-au-accent-text">{q.label}</b>
              </span>
              <button type="button" disabled={pending} onClick={() => run(() => approvePositionRequestAction(q.id), t('approved'))} className="inline-flex items-center gap-1 rounded-au-ctl bg-au-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                <Check className="size-4" /> {t('approve')}
              </button>
              <button type="button" disabled={pending} onClick={() => (setRejecting(rejecting === q.id ? null : q.id), setNote(''))} className="inline-flex items-center gap-1 rounded-au-ctl border border-au-line px-3 py-1.5 text-sm font-semibold text-au-muted hover:text-au-bad disabled:opacity-40">
                <X className="size-4" /> {t('rejectShort')}
              </button>
              {rejecting === q.id && (
                <div className="flex basis-full gap-2">
                  <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('rejectPh')} className="h-9 min-w-0 flex-1 rounded-au-ctl border border-au-line bg-au-card px-2.5 text-sm text-au-ink" />
                  <button type="button" disabled={pending || !note.trim()} onClick={() => run(() => rejectPositionRequestAction(q.id, note.trim()), t('rejected'))} className="rounded-au-ctl bg-au-bad px-3 text-sm font-semibold text-white disabled:opacity-40">
                    {t('reject')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {depts.map((dept) => (
        <section key={dept} className={cn(SURFACE_CARD, 'flex flex-col gap-2.5 p-5')}>
          <h3 className="text-sm font-bold text-au-muted uppercase tracking-wide">{deptLabels[dept] ?? dept}</h3>
          <div className="flex flex-wrap gap-2">
            {ladder.filter((r) => r.dept === dept).map((r) => {
              const has = held.includes(r.role);
              const req = reqOf(r.role);
              return (
                <div key={r.role} className={cn('flex items-center gap-2 rounded-au-ctl border px-3 py-1.5 text-sm', has ? 'border-au-accent bg-au-accent-soft' : 'border-au-line bg-au-card')}>
                  <span className={cn('font-semibold', has ? 'text-au-accent-text' : 'text-au-ink')}>{r.label}</span>
                  {has ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-au-accent-text"><Check className="size-3.5" /> {t('have')}</span>
                  ) : req ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-au-muted"><Clock className="size-3.5" /> {t('pending')}</span>
                  ) : r.role === 'ceo' ? (
                    <span className="text-xs text-au-faint">{t('assignOnly')}</span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => run(() => requestPositionAction(r.role), t('sent'))} className="inline-flex items-center gap-0.5 rounded-full bg-au-card-2 px-2 py-0.5 text-xs font-semibold text-au-accent-text hover:bg-au-accent-soft disabled:opacity-40">
                      <Plus className="size-3" /> {t('ask')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
