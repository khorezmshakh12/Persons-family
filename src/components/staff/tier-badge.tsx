import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StaffTier = 'A' | 'B' | 'C';

const TIER_CLASSES: Record<StaffTier, string> = {
  A: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  B: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  C: 'bg-muted text-muted-foreground',
};

export async function TierBadge({ tier, className }: { tier: StaffTier; className?: string }) {
  const t = await getTranslations('staff');

  return <Badge className={cn(TIER_CLASSES[tier], className)}>{t(`performance.tierLabels.${tier}`)}</Badge>;
}
