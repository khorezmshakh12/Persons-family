'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { addCalendarEventAction, deleteCalendarEventAction } from '@/lib/actions/operations';
import { ask, playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';

type Kind = OpsData['calendar'][number]['kind'];
export const KIND: Record<Kind, { n: string; tone: 'bad' | 'warn' | 'info' | 'mute' }> = {
  holiday: { n: 'Bayram · dars yo‘q', tone: 'bad' },
  exam: { n: 'Imtihon', tone: 'warn' },
  makeup: { n: 'Otrabotka', tone: 'info' },
  event: { n: 'Tadbir', tone: 'mute' },
};
const W = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const label = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)} · ${W[new Date(`${k}T00:00:00Z`).getUTCDay()]}`;

/** Operation HQ › Kalendar: holidays, exams, make-up lessons, events. */
export function OpsCalendar({ data }: { data: OpsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = data.today.day;
  const empty = { day: today, kind: 'makeup' as Kind, title: '', groupId: '', time: '', room: '' };
  const [f, setF] = useState(empty);
  const upcoming = data.calendar.filter((e) => e.day >= today);
  const groupName = (id: string | null) => (id ? data.groups.find((g) => g.id === id)?.name : null);

  const add = () =>
    start(async () => {
      const r = await addCalendarEventAction({ day: f.day, kind: f.kind, title: f.title, groupId: f.groupId || null, time: f.time || null, room: f.room || null });
      if (r.error) {
        playSound('err');
        toast.error(r.error === 'invalidInput' ? 'Sana va nomini kiriting' : r.error === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi");
        return;
      }
      playSound('ok');
      toast.success('Kalendarga qo‘shildi');
      setF(empty);
      router.refresh();
    });

  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Kalendar</h3>
        <small>bayramlar, imtihonlar, otrabotka — keyingi 60 kun</small>
      </div>
      {data.canEdit && (
        <div className="sx-form mb-3">
          <label>
            Sana
            <input type="date" className="sx-inp !w-[150px]" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          </label>
          <label>
            Turi
            <select className="sx-inp !w-[170px]" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
              {(Object.keys(KIND) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND[k].n}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[180px] flex-1">
            Nomi
            <input className="sx-inp" maxLength={200} value={f.title} placeholder="Masalan: Mustaqillik kuni" onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label>
            Guruh (ixtiyoriy)
            <select className="sx-inp !w-[170px]" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>
              <option value="">—</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vaqt
            <input type="time" className="sx-inp !w-[110px]" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </label>
          <label>
            Xona
            <input className="sx-inp !w-[90px]" maxLength={40} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} />
          </label>
          <button className="sx-btn primary" disabled={pending || !f.title.trim()} onClick={add}>
            <Plus className="size-4" /> Qo‘shish
          </button>
        </div>
      )}
      {upcoming.length === 0 ? (
        <div className="sx-empty">Yaqin kunlarda kalendarda hech narsa yo‘q</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((e) => (
            <li key={e.id} className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-au-line px-3 py-2 text-sm', e.day === today && 'border-au-accent/40 bg-au-accent-soft/50')}>
              <span className="w-[86px] shrink-0 font-semibold text-au-ink">{e.day === today ? 'Bugun' : label(e.day)}</span>
              <span className={cn('sx-pl', KIND[e.kind].tone)}>{KIND[e.kind].n}</span>
              <span className="min-w-0 flex-1 text-au-ink">
                {e.title}
                {(groupName(e.group_id) || e.time || e.room) && (
                  <span className="text-xs text-au-muted"> · {[groupName(e.group_id), e.time, e.room].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              {data.canEdit && (
                <button
                  className="sx-btn sm text-au-bad"
                  aria-label="O‘chirish"
                  disabled={pending}
                  onClick={async () =>
                    (await ask(`«${e.title}» o‘chirilsinmi?`)) &&
                    start(async () => {
                      const r = await deleteCalendarEventAction(e.id);
                      if (r.error) toast.error("O'chirib bo'lmadi");
                      else {
                        toast.success('O‘chirildi');
                        router.refresh();
                      }
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
