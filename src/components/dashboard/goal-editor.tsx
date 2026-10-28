'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GoalScope = 'day' | 'week' | 'month';
const SCOPES: { k: GoalScope; n: string }[] = [
  { k: 'day', n: 'Kunlik' },
  { k: 'week', n: 'Haftalik' },
  { k: 'month', n: 'Oylik' },
];

/**
 * Inline goal editor shared by the dashboard card and the Checklist board:
 * Enter saves, Esc cancels; the period can be moved (kunlik → haftalik…).
 */
export function GoalEditor({
  title,
  scope,
  onSave,
  onCancel,
  tone = 'au',
}: {
  title: string;
  scope: GoalScope;
  onSave: (title: string, scope: GoalScope) => void;
  onCancel: () => void;
  tone?: 'au' | 'qp';
}) {
  const [t, setT] = useState(title);
  const [s, setS] = useState<GoalScope>(scope);
  const save = () => (t.trim() ? onSave(t.trim(), s) : onCancel());
  const box = tone === 'qp' ? 'border-qp-line bg-qp-bg text-qp-ink focus:border-qp-mint' : 'border-au-line bg-au-card text-au-ink focus:border-au-accent';
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={t}
        maxLength={160}
        aria-label="Maqsad matni"
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onCancel();
        }}
        className={cn('h-8 min-w-0 flex-1 basis-40 rounded-lg border px-2.5 text-sm outline-none', box)}
      />
      <select value={s} onChange={(e) => setS(e.target.value as GoalScope)} aria-label="Davr" className={cn('h-8 rounded-lg border px-1.5 text-xs outline-none', box)}>
        {SCOPES.map((x) => (
          <option key={x.k} value={x.k}>
            {x.n}
          </option>
        ))}
      </select>
      <button type="button" onClick={save} aria-label="Saqlash" className={cn('grid size-8 place-items-center rounded-lg', tone === 'qp' ? 'bg-qp-mint text-qp-mint-ink' : 'bg-au-accent text-white')}>
        <Check className="size-4" />
      </button>
      <button type="button" onClick={onCancel} aria-label="Bekor qilish" className={cn('grid size-8 place-items-center rounded-lg', tone === 'qp' ? 'text-qp-muted' : 'text-au-faint')}>
        <X className="size-4" />
      </button>
    </span>
  );
}
