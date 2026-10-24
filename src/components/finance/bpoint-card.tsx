'use client';

import { useState, useTransition } from 'react';
import { Target, Pencil } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { setBpointAction } from '@/lib/actions/bpoint';

const fmt = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} so'm`;
const SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** B-nuqta: xodimning yillik maosh maqsadi + shu yil topilganiga nisbatan progress. */
export function BpointCard({
  year,
  amount,
  note,
  earnedYtd,
  monthsElapsed,
  canEdit,
  staffId,
}: {
  year: number;
  amount: number;
  note: string | null;
  earnedYtd: number;
  /** Months of `year` counted so far (1–12) — the pace the plan expects. */
  monthsElapsed: number;
  canEdit: boolean;
  staffId: string;
}) {
  const [editing, setEditing] = useState(amount <= 0 && canEdit);
  const [val, setVal] = useState(amount > 0 ? String(amount) : '');
  const [noteVal, setNoteVal] = useState(note ?? '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const pct = amount > 0 ? Math.round((earnedYtd / amount) * 100) : 0;
  const remaining = Math.max(0, amount - earnedYtd);
  // Straight-line plan: by the end of month N, N/12 of the B-nuqta.
  const planned = amount > 0 ? Math.round((amount * monthsElapsed) / 12) : 0;
  const pace = planned > 0 ? Math.round((earnedYtd / planned) * 100) : 0;

  const save = () =>
    start(async () => {
      setErr('');
      const res = await setBpointAction({ staffId, amount: val, note: noteVal });
      if ('error' in res) return setErr('Saqlashda xatolik');
      setEditing(false);
      router.refresh();
    });

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
            <Target className="size-4" />
          </span>
          <div>
            <span className="text-[11px] font-bold tracking-wider text-au-accent-text uppercase">B-nuqta · {year}</span>
            <h3 className="text-lg leading-tight font-bold text-au-ink">Shaxsiy daromad maqsadi</h3>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {amount > 0 && <span className={cn('fp-chip', pct >= 100 ? 'fp-chip-ok' : 'fp-chip-accent')}>{pct}% topildi</span>}
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2" aria-label="Tahrirlash">
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      </div>

      {amount > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">B-nuqta (yillik maqsad)</span>
              <span className="text-lg font-bold break-words text-au-ink tabular-nums">{fmt(amount)}</span>
            </div>
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">Yil boshidan (YTD)</span>
              <span className="text-lg font-bold break-words text-au-ok tabular-nums">{fmt(earnedYtd)}</span>
            </div>
          </div>
          {note && <p className="text-xs text-au-muted">{note}</p>}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-au-muted">B-nuqta bajarilishi (Yan–{SHORT[monthsElapsed - 1] ?? 'Dek'}):</span>
              <b className={pct >= 100 ? 'text-au-ok' : 'text-au-accent-text'}>{pct}%</b>
            </div>
            <div className="fp-kpi-bar h-2.5">
              <i style={{ width: `${Math.min(100, pct)}%`, background: 'linear-gradient(90deg, var(--au-accent), var(--au-ok))' }} />
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11px] text-au-muted">
              <span>
                Reja bo‘yicha shu vaqtgacha: <b className="text-au-ink tabular-nums">{fmt(planned)}</b>{' '}
                <b className={pace >= 100 ? 'text-au-ok' : 'text-au-bad'}>({pace}%)</b>
              </span>
              <span>
                Qoldi: <b className="text-au-ink tabular-nums">{fmt(remaining)}</b>
              </span>
            </div>
          </div>
        </>
      ) : (
        !editing && <p className="text-sm text-au-muted">B-nuqta belgilanmagan.</p>
      )}

      {editing && (
        <div className="flex flex-col gap-2 border-t border-au-line pt-3">
          <div className="flex items-center gap-2">
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              inputMode="numeric"
              placeholder="Yillik maqsad, masalan: 120000000"
              className="h-9 min-w-0 flex-1 rounded-au-ctl border border-au-line bg-au-card-2 px-3 text-xs text-au-ink tabular-nums outline-none focus:border-au-accent"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending || !(Number(val) > 0)}
              className="h-9 shrink-0 rounded-au-ctl bg-au-primary px-3 text-xs font-semibold text-au-primary-ink disabled:opacity-40"
            >
              Maqsadni saqlash
            </button>
          </div>
          <input
            value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)}
            placeholder="Izoh (ixtiyoriy)"
            className="h-9 rounded-au-ctl border border-au-line bg-au-card-2 px-3 text-xs text-au-ink outline-none focus:border-au-accent"
          />
          {err && <span className="text-xs text-au-bad">{err}</span>}
          {amount > 0 && (
            <button type="button" onClick={() => setEditing(false)} className="self-start text-xs font-semibold text-au-muted hover:text-au-ink">
              Bekor
            </button>
          )}
        </div>
      )}
    </section>
  );
}
