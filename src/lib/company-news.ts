/** Posts older than this are simply not fetched — they still exist in the
 * table (an admin deleting one is still a real, permanent row delete), this
 * just keeps both the /company-news feed and the dashboard widget scoped to
 * what's still current. */
export function companyNewsCutoff(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}
