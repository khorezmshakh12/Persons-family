'use client';

import { useTransition } from 'react';
import { GripVertical, Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { placeGroupAction } from '@/lib/actions/operations';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';

type Group = OpsData['groups'][number];
type Cohort = 'odd' | 'even';

/* ------------------------------------------------------------ slot finder */

export type Finder = { time: string; minCap: number };

export function SlotFinderBar({ times, value, onChange, matches }: { times: string[]; value: Finder | null; onChange: (f: Finder | null) => void; matches: number }) {
  const v = value ?? { time: '', minCap: 0 };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-au-ok/50 bg-au-ok-soft/40 px-3 py-2 text-sm">
      <Search className="size-4 text-au-ok" aria-hidden />
      <b className="text-au-ink">Bo‘sh joy topish</b>
      <select className="sx-inp !h-[30px] !w-[130px]" value={v.time} onChange={(e) => onChange({ ...v, time: e.target.value })} aria-label="Vaqt">
        <option value="">Har qanday vaqt</option>
        {times.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs text-au-muted">
        kamida
        <input className="sx-inp !h-[30px] !w-[70px]" type="number" min={0} max={200} value={v.minCap || ''} placeholder="0" onChange={(e) => onChange({ ...v, minCap: Number(e.target.value) || 0 })} />
        o‘rin
      </label>
      {value && (
        <>
          <span key={matches} className="lane-count rounded-full bg-au-ok px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
            {matches} ta mos slot
          </span>
          <button className="text-xs font-semibold text-au-muted hover:text-au-ink" onClick={() => onChange(null)}>
            Tozalash
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ placing groups */

/** Unscheduled groups as draggable chips (or tap-to-pick on touch); the
 * matrix drops them into a free cell through placeGroupAction. */
export function UnscheduledGroups({ groups, picked, onPick }: { groups: Group[]; picked: string | null; onPick: (id: string | null) => void }) {
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Jadvalga kiritilmagan guruhlar</h3>
        <small>{groups.length ? `${groups.length} ta · bo‘sh slotga sudrang yoki bosib tanlang` : ''}</small>
      </div>
      {groups.length === 0 ? (
        <div className="sx-empty">Hamma guruhlar jadvalda ✓</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groups.map((g, i) => (
            <button
              key={g.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/group', g.id);
                e.dataTransfer.effectAllowed = 'move';
                onPick(g.id);
              }}
              onDragEnd={() => onPick(null)}
              onClick={() => onPick(picked === g.id ? null : g.id)}
              aria-pressed={picked === g.id}
              className={cn(
                'ms-rise inline-flex cursor-grab items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors active:cursor-grabbing',
                picked === g.id ? 'ms-pulse border-au-accent bg-au-accent text-au-accent-ink' : 'border-au-line bg-au-card text-au-ink hover:border-au-accent',
              )}
              style={{ ['--i' as string]: Math.min(i, 8) }}
            >
              <GripVertical className="size-3.5 opacity-60" aria-hidden />
              {g.name}
              <span className="text-[11px] font-normal opacity-70">{g.teacher}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function usePlaceGroup() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const place = (groupId: string, room: string, time: string, cohort: Cohort, onDone?: () => void) =>
    start(async () => {
      const r = await placeGroupAction({ groupId, room, time, cohort });
      if (r.error) {
        toast.error(r.error === 'slotTaken' ? 'Bu slot band' : r.error === 'teacherBusy' ? 'O‘qituvchi bu vaqtda boshqa guruhda' : r.error === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi");
        return;
      }
      playSound('tick');
      toast.success(`Guruh ${room} · ${time} ga joylandi`);
      onDone?.();
      router.refresh();
    });
  return { place, busy };
}
