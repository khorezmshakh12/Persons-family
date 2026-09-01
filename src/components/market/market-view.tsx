'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import {
  Sparkles,
  ShoppingBag,
  Package,
  ShieldCheck,
  Search,
  ArrowDownUp,
  CheckCircle2,
  XCircle,
  Clock,
  PackageCheck,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

import type { MarketItemRow, MarketOrderRow, MarketAdminOrderRow } from '@/lib/actions/market';
import { setMarketItemActiveAction } from '@/lib/actions/market';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OrderRewardDialog } from './order-reward-dialog';
import { CreateItemDialog } from './create-item-dialog';
import { EditItemDialog } from './edit-item-dialog';
import { DecideOrderActions } from './decide-order-dialog';

type MarketViewProps = {
  balance: number;
  items: MarketItemRow[];
  orders: MarketOrderRow[];
  adminView: {
    allowed: boolean;
    items: MarketItemRow[];
    pendingOrders: MarketAdminOrderRow[];
  };
};

type MarketTab = 'shop' | 'myOrders' | 'admin';
type SortMode = 'default' | 'price-asc' | 'price-desc' | 'name';

function ItemActiveToggle({ item }: { item: MarketItemRow }) {
  const t = useTranslations('market');
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const formData = new FormData();
    formData.set('itemId', item.id);
    formData.set('isActive', item.is_active ? 'false' : 'true');

    startTransition(async () => {
      const result = await setMarketItemActiveAction(undefined, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('admin.itemSaved'));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={toggle}
      className={cn(
        'h-8 gap-1.5 text-xs font-medium',
        item.is_active
          ? 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10'
          : 'text-white/50 hover:text-white/80 hover:bg-white/5',
      )}
    >
      {item.is_active ? <ToggleRight className="size-4 text-emerald-400" /> : <ToggleLeft className="size-4 text-white/40" />}
      {item.is_active ? t('admin.active') : t('admin.inactive')}
    </Button>
  );
}

export function MarketView({ balance, items, orders, adminView }: MarketViewProps) {
  const t = useTranslations('market');
  const format = useFormatter();

  const [activeTab, setActiveTab] = useState<MarketTab>('shop');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');

  // Shop Items filtering & sorting
  const shopItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  });

  if (sortMode === 'price-asc') {
    shopItems.sort((a, b) => a.star_cost - b.star_cost);
  } else if (sortMode === 'price-desc') {
    shopItems.sort((a, b) => b.star_cost - a.star_cost);
  } else if (sortMode === 'name') {
    shopItems.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header / Balance Card */}
      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
              {t('title')}
            </h1>
            <p className="text-sm text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
              {t('subtitle')}
            </p>
          </div>

          {/* Balance Box */}
          <div className="flex items-center gap-3.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-3 shadow-sm">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300">
              <Sparkles className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-amber-200/80">{t('yourBalance')}</span>
              <span className="font-heading text-2xl font-bold text-amber-300">
                {t('starCount', { count: balance })}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('shop')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              activeTab === 'shop'
                ? 'bg-white/20 text-white shadow-sm border border-white/20'
                : 'text-white/70 hover:text-white hover:bg-white/5',
            )}
          >
            <ShoppingBag className="size-4" />
            {t('tabs.shop')}
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('myOrders')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              activeTab === 'myOrders'
                ? 'bg-white/20 text-white shadow-sm border border-white/20'
                : 'text-white/70 hover:text-white hover:bg-white/5',
            )}
          >
            <Package className="size-4" />
            {t('tabs.myOrders')}
            {orders.length > 0 && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                {orders.length}
              </span>
            )}
          </button>

          {adminView.allowed && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                activeTab === 'admin'
                  ? 'bg-amber-500/20 text-amber-200 shadow-sm border border-amber-500/30'
                  : 'text-white/70 hover:text-white hover:bg-white/5',
              )}
            >
              <ShieldCheck className="size-4" />
              {t('tabs.admin')}
              {adminView.pendingOrders.length > 0 && (
                <span className="rounded-full bg-red-500/80 text-white px-2 py-0.5 text-xs font-bold">
                  {adminView.pendingOrders.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SHOP REWARDS */}
      {activeTab === 'shop' && (
        <div className="flex flex-col gap-5">
          {/* Search & Sort Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-white/20 bg-white/10 pl-9 text-white placeholder:text-white/40"
              />
            </div>

            <div className="flex items-center gap-2">
              <ArrowDownUp className="size-4 text-white/70" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="h-9 rounded-md border border-white/20 bg-slate-900/80 px-3 text-sm text-white focus:outline-none"
              >
                <option value="default" className="bg-slate-900">{t('allRewards')}</option>
                <option value="price-asc" className="bg-slate-900">{t('sortLowest')}</option>
                <option value="price-desc" className="bg-slate-900">{t('sortHighest')}</option>
                <option value="name" className="bg-slate-900">{t('admin.name')}</option>
              </select>
            </div>
          </div>

          {/* Items Grid */}
          {shopItems.length === 0 ? (
            <div className={cn(GLASS_CARD, 'flex flex-col items-center justify-center gap-2 py-16 text-center')}>
              <ShoppingBag className="size-12 text-white/20" />
              <p className="text-sm text-white/60">{t('noItems')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shopItems.map((item) => {
                const isOutOfStock = item.stock !== null && item.stock <= 0;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      GLASS_CARD,
                      'flex flex-col overflow-hidden rounded-xl border border-white/15 transition-all duration-200 hover:border-white/30',
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-44 w-full overflow-hidden bg-white/5">
                      {item.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/20">
                          <PackageCheck className="size-12" />
                        </div>
                      )}

                      {/* Stock Badge */}
                      <div className="absolute top-2.5 right-2.5">
                        {item.stock === null ? (
                          <span className="rounded-full border border-emerald-500/30 bg-slate-900/80 px-2.5 py-0.5 text-xs font-medium text-emerald-300 backdrop-blur-sm">
                            {t('unlimitedStock')}
                          </span>
                        ) : isOutOfStock ? (
                          <span className="rounded-full border border-red-500/30 bg-slate-900/80 px-2.5 py-0.5 text-xs font-medium text-red-300 backdrop-blur-sm">
                            {t('outOfStock')}
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-500/30 bg-slate-900/80 px-2.5 py-0.5 text-xs font-medium text-amber-300 backdrop-blur-sm">
                            {t('stockLeft', { count: item.stock })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-heading text-base font-bold text-white line-clamp-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                            {item.name}
                          </h3>
                          <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                            <Sparkles className="size-3.5" />
                            {item.star_cost}
                          </span>
                        </div>

                        {item.description && (
                          <p className="line-clamp-2 text-xs text-white/70 whitespace-pre-wrap">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2">
                        <OrderRewardDialog item={item} balance={balance} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY ORDERS */}
      {activeTab === 'myOrders' && (
        <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-5')}>
          <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
            {t('myOrdersTitle')}
          </h2>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Package className="size-10 text-white/20" />
              <p className="text-sm text-white/60">{t('noOrders')}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {orders.map((order) => {
                return (
                  <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-amber-300">
                        <ShoppingBag className="size-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{order.item_name}</span>
                        <span className="text-xs text-white/50">
                          {format.dateTime(new Date(order.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        {order.note && (
                          <span className="text-xs italic text-red-200/80 pt-1">
                            {t('admin.note')}: {order.note}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
                        <Sparkles className="size-3.5" />
                        {t('starCount', { count: order.star_cost })}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                          order.status === 'pending' && 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                          order.status === 'approved' && 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                          order.status === 'rejected' && 'bg-red-500/20 text-red-300 border-red-500/40',
                          order.status === 'fulfilled' && 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                        )}
                      >
                        {order.status === 'pending' && <Clock className="size-3" />}
                        {order.status === 'approved' && <CheckCircle2 className="size-3" />}
                        {order.status === 'rejected' && <XCircle className="size-3" />}
                        {order.status === 'fulfilled' && <PackageCheck className="size-3" />}
                        {t(`status.${order.status}`)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CURATION (CEO ONLY) */}
      {activeTab === 'admin' && adminView.allowed && (
        <div className="flex flex-col gap-6">
          {/* PENDING ORDERS QUEUE */}
          <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-5')}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                {t('admin.pendingOrders')}
              </h2>
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/30">
                {adminView.pendingOrders.length}
              </span>
            </div>

            {adminView.pendingOrders.length === 0 ? (
              <p className="text-sm text-white/60">{t('admin.noPendingOrders')}</p>
            ) : (
              <div className="divide-y divide-white/10">
                {adminView.pendingOrders.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-white">
                          {order.first_name} {order.last_name}
                        </span>
                        <span className="text-sm text-white/80">
                          {t('order')}: {order.item_name}
                        </span>
                        <span className="text-xs text-white/50">
                          {format.dateTime(new Date(order.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
                        <Sparkles className="size-3.5" />
                        {t('starCount', { count: order.star_cost })}
                      </span>
                      <DecideOrderActions order={order} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CATALOG MANAGEMENT */}
          <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-5')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                {t('admin.catalogManagement')}
              </h2>
              <CreateItemDialog />
            </div>

            {adminView.items.length === 0 ? (
              <p className="text-sm text-white/60">{t('noItems')}</p>
            ) : (
              <div className="divide-y divide-white/10">
                {adminView.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5">
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-white/15">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-white/30">
                          <PackageCheck className="size-5" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{item.name}</span>
                        <div className="flex items-center gap-2 text-xs text-white/60">
                          <span>
                            {item.stock === null ? t('unlimitedStock') : t('stockLeft', { count: item.stock })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
                        <Sparkles className="size-3.5" />
                        {t('starCount', { count: item.star_cost })}
                      </span>
                      <ItemActiveToggle item={item} />
                      <EditItemDialog item={item} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}