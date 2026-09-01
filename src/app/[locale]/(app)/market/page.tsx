import { getMarketAction, getMarketAdminAction } from '@/lib/actions/market';
import { MarketView } from '@/components/market/market-view';

export const dynamic = 'force-dynamic';

export default async function MarketPage() {
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
