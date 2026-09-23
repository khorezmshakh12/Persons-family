import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StaffTier = 'A' | 'B' | 'C';

// Translucent tints, matching the rest of the app's Badge tint language —
// the old `bg-*-100 text-*-700` pastels (with dead `dark:` variants, since
// the theme is force-light) read as flat light chips against the glass UI.
const TIER_CLASSES: Record<StaffTier, string> = {
  A: 'rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 font-bold text-emerald-200',
  B: 'rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-1 font-bold text-amber-200',
  C: 'rounded-full border border-white/20 bg-white/10 px-3 py-1 font-bold text-white/80',
};

export async function TierBadge({ tier, className }: { tier: StaffTier; className?: string }) {
  const t = await getTranslations('staff');

  return <Badge className={cn(TIER_CLASSES[tier], className)}>{t(`performance.tierLabels.${tier}`)}</Badge>;
}
