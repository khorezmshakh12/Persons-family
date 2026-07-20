/** Cutoff for the sidebar's "new items" green dot — items created after
 * this are recent enough to flag. Kept out of the layout's render body
 * since a direct `Date.now()` call there would be an impure render call. */
export function recentNavItemsCutoff(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}
