import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StaffTier = 'A' | 'B' | 'C';

const TIER_CLASSES: Record<StaffTier, string> = {
  A: 'rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  B: 'rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  C: 'rounded-full bg-gray-100 px-3 py-1 font-bold text-gray-700 dark:bg-gray-500/15 dark:text-gray-400',
};

export async function TierBadge({ tier, className }: { tier: StaffTier; className?: string }) {
  const t = await getTranslations('staff');

  return <Badge className={cn(TIER_CLASSES[tier], className)}>{t(`performance.tierLabels.${tier}`)}</Badge>;
}
