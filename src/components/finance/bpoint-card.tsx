'use client';

import { useState, useTransition } from 'react';
import { Target, Pencil } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { setBpointAction } from '@/lib/actions/bpoint';

const fmt = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} so'm`;

/** B-nuqta: xodimning yillik maosh maqsadi + shu yil topilganiga nisbatan progress. */
export function BpointCard({
  year,
  amount,
  note,
  earnedYtd,
  canEdit,
  staffId,
}: {
  year: number;
  amount: number;
  note: string | null;
  earnedYtd: number;
  canEdit: boolean;
  staffId: string;
}) {
  const [editing, setEditing] = useState(amount <= 0 && canEdit);
  const [val, setVal] = useState(amount > 0 ? String(amount) : '');
  const [noteVal, setNoteVal] = useState(note ?? '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const pct = amount > 0 ? Math.min(100, Math.round((earnedYtd / amount) * 100)) : 0;
  const remaining = Math.max(0, amount - earnedYtd);

  const save = () =>
    start(async () => {
      setErr('');
      const res = await setBpointAction({ staffId, amount: val, note: noteVal });
      if ('error' in res) setErr('Saqlashda xatolik');
      else setEditing(false);
    });

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <Target className="size-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold text-au-ink">B-nuqta · {year}</h2>
          <p className="text-xs text-au-muted">Yil oxirigacha maosh maqsadi</p>
        </div>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2" aria-label="Tahrirlash">
            <Pencil className="size-4" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            inputMode="numeric"
            placeholder="Masalan: 120000000"
            className="rounded-au-ctl border border-au-line bg-au-card px-3 py-2 text-sm text-au-ink outline-none focus:border-au-accent"
          />
          <input
            value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)}
            placeholder="Izoh (ixtiyoriy)"
            className="rounded-au-ctl border border-au-line bg-au-card px-3 py-2 text-sm text-au-ink outline-none focus:border-au-accent"
          />
          {err && <span className="text-xs text-au-bad">{err}</span>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending || !(Number(val) > 0)} className="rounded-au-ctl bg-au-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              Saqlash
            </button>
            {amount > 0 && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-au-ctl border border-au-line px-3 py-1.5 text-sm font-semibold text-au-muted">
                Bekor
              </button>
            )}
          </div>
        </div>
      ) : amount > 0 ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-bold tracking-tight text-au-ink">{fmt(amount)}</div>
              {note && <div className="text-xs text-au-muted">{note}</div>}
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-au-accent-text">{pct}%</div>
              <div className="text-xs text-au-muted">topildi</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-au-line">
            <div className="h-full rounded-full bg-au-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-au-muted">
            <span>Shu yil: <b className="text-au-ink">{fmt(earnedYtd)}</b></span>
            <span>Qoldi: <b className="text-au-ink">{fmt(remaining)}</b></span>
          </div>
        </>
      ) : (
        <p className="text-sm text-au-muted">B-nuqta belgilanmagan.</p>
      )}
    </section>
  );
}
