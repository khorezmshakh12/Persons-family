/** Always "this month," in UTC, as a plain date string — never a
 * client-supplied value, so the (user_id, month) unique constraint on
 * self_development means "once per calendar month, for real." Shared
 * between the submit action and the page's "already submitted?" check. */
export function firstOfCurrentMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}
