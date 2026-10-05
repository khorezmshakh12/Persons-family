/**
 * postgres-js returns `numeric` columns as strings, and several call sites
 * still `+`-reduce those before handing the result here — so this must
 * tolerate a string, a NaN, and null/undefined without ever rendering the
 * literal "NaN" to a user. Non-finite input degrades to "0".
 */
export function formatUZS(amount: number | string | null | undefined): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '0';
  // Comma-grouped (1,000,000), no fraction digits — owner, 2026-10-05:
  // every amount on the site is written with commas.
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
