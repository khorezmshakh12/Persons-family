'use client';

import { Bug, Sparkles } from 'lucide-react';
import { CHIP_ACCENT, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK } from '@/lib/glass';
import type { IssueAi } from '@/lib/actions/issues';

const CATEGORY_LABEL: Record<string, string> = {
  sayt_it: 'Sayt / IT',
  texnik_jihoz: 'Jihoz / bino',
  oquv_jarayoni: "O'quv jarayoni",
  moliya: 'Moliya',
  xodimlar: 'Xodimlar',
  boshqa: 'Boshqa',
};
const URGENCY = [
  { n: 'Shoshilinch emas', c: CHIP_NEUTRAL },
  { n: 'Oddiy', c: CHIP_INFO },
  { n: 'Muhim', c: CHIP_ACCENT },
  { n: 'Shoshilinch', c: CHIP_BAD },
];

/** TypeSafe triage shown as chips. Only confident judgments are shown:
 * category needs ≥ 50% confidence, the bug flag ≥ 60% probability. */
export function IssueAiChips({ ai }: { ai: IssueAi | null | undefined }) {
  if (!ai) return null;
  const urgency = ai.urgency === null ? null : URGENCY[Math.max(0, Math.min(3, Math.round(ai.urgency)))];
  const showCategory = ai.category && (ai.categoryConfidence ?? 0) >= 0.5;
  const bug = (ai.itBug ?? 0) >= 0.6;
  if (!urgency && !showCategory && !bug) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" title="TypeSafe AI tahlili">
      <Sparkles className="size-3.5 text-au-accent-text" aria-hidden />
      {bug && (
        <span className={CHIP_BAD}>
          <Bug className="size-3" aria-hidden /> IT bug · {Math.round((ai.itBug ?? 0) * 100)}%
        </span>
      )}
      {urgency && <span className={urgency.c}>{urgency.n}</span>}
      {showCategory && <span className={CHIP_OK}>{CATEGORY_LABEL[ai.category!] ?? ai.category}</span>}
    </div>
  );
}
