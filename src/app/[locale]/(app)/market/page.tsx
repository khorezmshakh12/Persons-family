import { getMarketAction, getMarketAdminAction } from '@/lib/actions/market';
import { canSeeFor } from '@/lib/permissions';
import { getTranslations } from 'next-intl/server';
import { ShoppingBag } from 'lucide-react';
import { MarketView } from '@/components/market/market-view';
import { getAuthState } from '@/lib/auth/session';

import { isMarketEditor } from '@/lib/market-editors';

export const dynamic = 'force-dynamic';

export default async function MarketPage() {
  const { profile } = await getAuthState();
  // Closed to everyone else while the catalogue is prepared. The star pill,
  // dashboard KPI and hero button still link here, so show a friendly
  // "coming soon" card instead of a 404.
  if (!profile || (!canSeeFor(profile, 'market') && !(await isMarketEditor(profile.id)))) {
    const t = await getTranslations('market');
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10 text-center">
        <ShoppingBag className="size-12 text-au-faint" />
        <h1 className="text-xl font-bold text-au-ink">{t('title')}</h1>
        <p className="text-sm text-au-muted">{t('comingSoon')}</p>
      </div>
    );
  }

  const [marketData, adminData] = await Promise.all([
    getMarketAction(),
    getMarketAdminAction(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <MarketView
        balance={marketData.balance}
        items={marketData.items}
        orders={marketData.orders}
        adminView={adminData}
      />
    </div>
  );
}
