import { getMarketAction, getMarketAdminAction } from '@/lib/actions/market';
import { notFound } from 'next/navigation';
import { MarketView } from '@/components/market/market-view';
import { getAuthState } from '@/lib/auth/session';
import { MARKET_ROLES } from '@/lib/nav';

export const dynamic = 'force-dynamic';

export default async function MarketPage() {
  const { profile } = await getAuthState();
  if (!profile || !MARKET_ROLES.includes(profile.role)) notFound();

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
