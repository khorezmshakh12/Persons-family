/**
 * Plain constants/helpers shared by the Market UI and its Server Actions.
 *
 * Lives outside `lib/actions/market.ts` because that module is `'use server'`
 * and may only export async functions — a bare `export const` there is a build
 * error, not a lint warning.
 */

/** Stock at or below this (and above 0) reads as "running low": the CEO gets a
 *  restock nudge in the catalog and the shop card shows an urgency badge.
 *  `stock === null` means unlimited and is never low. */
export const MARKET_LOW_STOCK_THRESHOLD = 3;

export function isLowStock(stock: number | null): boolean {
  return stock !== null && stock > 0 && stock <= MARKET_LOW_STOCK_THRESHOLD;
}
