'use client';

import { Bug, Sparkles } from 'lucide-react';
import { CHIP_ACCENT, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK } from '@/lib/glass';
import type { IssueAi } from '@/lib/actions/issues';
import { useTranslations } from 'next-intl';

const URGENCY = [
  { n: 'u0', c: CHIP_NEUTRAL },
  { n: 'u1', c: CHIP_INFO },
  { n: 'u2', c: CHIP_ACCENT },
  { n: 'u3', c: CHIP_BAD },
];
const CATEGORIES = ['sayt_it', 'texnik_jihoz', 'oquv_jarayoni', 'moliya', 'xodimlar', 'boshqa', 'none'];

/** TypeSafe triage shown as chips. Only confident judgments are shown:
 * category needs ≥ 50% confidence, the bug flag ≥ 60% probability. */
export function IssueAiChips({ ai }: { ai: IssueAi | null | undefined }) {
  const t = useTranslations('iss');
  if (!ai) return null;
  const urgency = ai.urgency === null ? null : URGENCY[Math.max(0, Math.min(3, Math.round(ai.urgency)))];
  const showCategory = ai.category && (ai.categoryConfidence ?? 0) >= 0.5;
  const bug = (ai.itBug ?? 0) >= 0.6;
  if (!urgency && !showCategory && !bug) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" title={t('ai.title')}>
      <Sparkles className="size-3.5 text-au-accent-text" aria-hidden />
      {bug && (
        <span className={CHIP_BAD}>
          <Bug className="size-3" aria-hidden /> IT bug · {Math.round((ai.itBug ?? 0) * 100)}%
        </span>
      )}
      {urgency && <span className={urgency.c}>{t(`ai.${urgency.n}`)}</span>}
      {showCategory && <span className={CHIP_OK}>{CATEGORIES.includes(ai.category!) ? t(`cat.${ai.category}`) : ai.category}</span>}
    </div>
  );
}
