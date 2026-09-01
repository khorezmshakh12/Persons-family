/**
 * postgres-js returns `numeric` columns as strings, and several call sites
 * still `+`-reduce those before handing the result here — so this must
 * tolerate a string, a NaN, and null/undefined without ever rendering the
 * literal "NaN" to a user. Non-finite input degrades to "0".
 */
export function formatUZS(amount: number | string | null | undefined): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '0';
  // Space-grouped, no fraction digits — the normal way a som figure is
  // written in uz, not the en-US comma grouping this used before.
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(n);
}
