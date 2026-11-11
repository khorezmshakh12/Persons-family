'use client';

import { useState, useTransition } from 'react';
import { Target, Pencil } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { setBpointAction } from '@/lib/actions/bpoint';
import type { BpointProgress } from '@/lib/bpoint';

const fmt = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} so'm`;
const MONTH = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/** B-nuqta: xodimning OYLIK daromad maqsadi. A-nuqta (yilning birinchi
 * maoshli oyi) → hozirgi oylik → B-nuqta (maqsad oylik). */
export function BpointCard({
  year,
  note,
  progress,
  canEdit,
  staffId,
}: {
  year: number;
  note: string | null;
  progress: BpointProgress;
  canEdit: boolean;
  staffId: string;
}) {
  const amount = progress.target;
  const [editing, setEditing] = useState(amount <= 0 && canEdit);
  const [val, setVal] = useState(amount > 0 ? String(amount) : '');
  const [noteVal, setNoteVal] = useState(note ?? '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const { start: aAmount, startMonth, current, currentMonth, pct, road, gap } = progress;
  const reached = amount > 0 && current >= amount;
  const typed = Number(val.replace(/\D/g, '')) || 0;

  const save = () =>
    start(async () => {
      setErr('');
      const res = await setBpointAction({ staffId, amount: typed, note: noteVal });
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
            <h3 className="text-lg leading-tight font-bold text-au-ink">Oylik daromad maqsadi</h3>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {amount > 0 && current > 0 && <span className={cn('fp-chip', reached ? 'fp-chip-ok' : 'fp-chip-accent')}>B-nuqtaning {pct}%</span>}
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2" aria-label="Tahrirlash">
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      </div>

      {amount > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">A-nuqta{startMonth >= 0 ? ` (${MONTH[startMonth]} oyligi)` : ''}</span>
              <span className="text-lg font-bold break-words text-au-ink tabular-nums">{aAmount > 0 ? fmt(aAmount) : '—'}</span>
            </div>
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">Hozir{currentMonth >= 0 ? ` (${MONTH[currentMonth]} oyligi)` : ''}</span>
              <span className="text-lg font-bold break-words text-au-ok tabular-nums">{current > 0 ? fmt(current) : '—'}</span>
            </div>
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">B-nuqta (maqsad oylik)</span>
              <span className="text-lg font-bold break-words text-au-accent-text tabular-nums">{fmt(amount)}</span>
            </div>
          </div>
          {note && <p className="text-xs text-au-muted">{note}</p>}
          {current > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-au-muted">A dan B gacha yo‘l:</span>
                <b className={reached ? 'text-au-ok' : 'text-au-accent-text'}>
                  {reached ? 'B-nuqtaga yetildi' : `${road}% bosib o‘tildi · oylik yana ${fmt(gap)} oshishi kerak`}
                </b>
              </div>
              <div className="fp-kpi-bar h-2.5">
                <i style={{ width: `${road}%`, background: 'linear-gradient(90deg, var(--au-accent), var(--au-ok))' }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-au-muted">{year}-yilda hali hisoblangan oylik yo‘q.</p>
          )}
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
              placeholder="Oylik maqsad, masalan: 10000000"
              className="h-9 min-w-0 flex-1 rounded-au-ctl border border-au-line bg-au-card-2 px-3 text-xs text-au-ink tabular-nums outline-none focus:border-au-accent"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending || !(typed > 0)}
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
