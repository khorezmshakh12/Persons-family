'use client';

import { useState, useTransition } from 'react';
import { BellRing, Check } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { SURFACE_CARD, SURFACE_INSET } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { markStudentReminderDoneAction } from '@/lib/actions/student-reminders';

export type StudentReminder = { id: string; studentName: string; body: string; remindAt: string; overdue: boolean };

const dmy = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;

/** Eslatmalar — student-note reminders due today or earlier; «O‘qidim» hides one. */
export function StudentRemindersCard({ items }: { items: StudentReminder[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [, start] = useTransition();
  const list = items.filter((i) => !hidden.includes(i.id));
  if (list.length === 0) return null;

  const done = (id: string) => {
    setHidden((h) => [...h, id]);
    start(async () => {
      const r = await markStudentReminderDoneAction(id);
      if (r.error) setHidden((h) => h.filter((x) => x !== id));
      else router.refresh();
    });
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex min-w-0 flex-col gap-3 p-5')} aria-label="Eslatmalar">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <BellRing className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-au-ink">Eslatmalar</h2>
          <p className="text-xs text-au-muted">o‘quvchilar bo‘yicha · {list.length} ta</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.id} className={cn(SURFACE_INSET, 'flex flex-wrap items-start gap-3 px-4 py-3')}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm text-au-ink">{r.studentName}</b>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-bold',
                    r.overdue ? 'bg-au-bad-soft text-au-bad' : 'bg-au-accent-soft text-au-accent-text',
                  )}
                >
                  {dmy(r.remindAt)} · {r.overdue ? 'muddati o‘tgan' : 'bugun'}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-au-muted">{r.body}</p>
            </div>
            <button
              type="button"
              onClick={() => done(r.id)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-au-ctl border border-au-line bg-au-card px-3 text-xs font-semibold text-au-ink transition-colors hover:bg-au-card-2"
            >
              <Check className="size-3.5" /> O‘qidim
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
