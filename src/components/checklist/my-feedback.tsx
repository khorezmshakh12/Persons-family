import { MessageSquareText } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { ChecklistFeedback } from '@/lib/checklist-feedback';

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** «Mening checklistim»: notes CEO / COO / HR left on your checklist over
 * the last week. Read-only — no replies (owner, 2026-11-13). */
export function MyFeedback({ items }: { items: ChecklistFeedback[] }) {
  if (items.length === 0) return null;
  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
      <h2 className="flex items-center gap-2 text-base font-bold text-au-ink">
        <MessageSquareText className="size-4 text-au-accent-text" aria-hidden />
        Checklistingizga feedback
        <span className="text-xs font-medium text-au-muted">· oxirgi 7 kun</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((f) => (
          <li key={f.id} className="rounded-au-ctl border border-au-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-au-muted">
              <span className="font-semibold text-au-ink">{f.authorName}</span>
              <span>{fmtDay(f.day)}</span>
              <span className="rounded-full bg-au-card-2 px-2 py-0.5">{f.itemTitle ? `Band: ${f.itemTitle}` : 'Kun bo‘yicha'}</span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap text-au-ink">{f.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
