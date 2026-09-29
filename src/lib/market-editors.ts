import 'server-only';
import { sql } from '@/lib/db/client';

/** Listed in market_editors — owner-granted Persons Market item managers
 *  besides the CEO (see the 20261001100000 migration). */
export async function isMarketEditor(userId: string): Promise<boolean> {
  const rows = await sql`select 1 from market_editors where user_id = ${userId}`;
  return rows.length > 0;
}
