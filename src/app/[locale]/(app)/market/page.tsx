import { getFormatter, getTranslations } from 'next-intl/server';
import { getMarketAction } from '@/lib/actions/market';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Deliberately plain: this is the data-complete stub for Persons Market so
// the route exists and every query is exercised end to end. The visual
// design (item cards, ordering flow, CEO curation panel) is built on top of
// getMarketAction/getMarketAdminAction/placeMarketOrderAction separately.
export default async function MarketPage() {
  const t = await getTranslations('market');
  const format = await getFormatter();
  const { balance, items, orders } = await getMarketAction();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      <div className={cn(GLASS_CARD, 'flex items-center justify-between gap-3 p-6')}>
        <span className="text-sm text-white/70">{t('yourBalance')}</span>
        <span className="font-heading text-2xl font-bold text-white">{t('starCount', { count: balance })}</span>
      </div>

      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('itemsTitle')}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-white/60">{t('noItems')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-white">{item.name}</span>
                  {item.description && (
                    <span className="text-sm whitespace-pre-wrap text-white/70">{item.description}</span>
                  )}
                  <span className="text-xs text-white/50">
                    {item.stock === null
                      ? t('unlimitedStock')
                      : item.stock > 0
                        ? t('stockLeft', { count: item.stock })
                        : t('outOfStock')}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold text-white">
                  {t('starCount', { count: item.star_cost })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('myOrdersTitle')}
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-white/60">{t('noOrders')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-white">{order.item_name}</span>
                  <span className="text-xs text-white/50">
                    {format.dateTime(new Date(order.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm text-white/80">{t('starCount', { count: order.star_cost })}</span>
                  <span className="text-xs text-white/60">{t(`status.${order.status}`)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
