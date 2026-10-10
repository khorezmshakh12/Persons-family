'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { authErrorCode, requireCap, ForbiddenError, SessionExpiredError } from '@/lib/auth/require-admin';
import { can, canSeeFor } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { getStarBalance } from '@/lib/stars';
import { insertStarTransaction } from '@/lib/stars-write';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';
import { createSignedReadUrl, createSignedWriteUrl } from '@/lib/gcp/storage';
import { MARKET_CATEGORIES, type MarketCategory } from '@/lib/market';

import { isMarketEditor } from '@/lib/market-editors';

export type MarketActionState =
  | {
      error?: string;
      /** Set by deleteMarketItemAction when the item had order history and was
       *  archived instead of removed, so the UI can say which one happened. */
      archived?: boolean;
    }
  | undefined;

// Market item images live in the chat_media bucket under a market/ prefix
// (private, same as avatars) — pasted image-search URLs like the Yandex
// thumbnail ones don't hotlink from another origin, which is why every
// image "disappeared". `image_url` now stores either a bucket object path
// (uploaded) or, for legacy rows, a full http(s) URL.
const MARKET_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MARKET_IMAGE_TTL = 60 * 60; // 1h, re-minted every fetch

async function resolveImage(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored; // legacy pasted URL — pass through
  try {
    return await createSignedReadUrl('chat_media', stored, MARKET_IMAGE_TTL);
  } catch (error) {
    console.error('market resolveImage failed', stored, error instanceof Error ? error.message : error);
    return null;
  }
}

export type MarketImageUploadResult = { path?: string; url?: string; error?: string };

/** CEO issues a signed PUT so the browser uploads straight to Cloud Storage. */
export async function requestMarketImageUploadUrlAction(
  fileName: string,
  fileType: string,
): Promise<MarketImageUploadResult> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const ext = MARKET_IMAGE_TYPES[fileType];
  if (!ext) return { error: 'invalidImageType' };
  const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `market/${crypto.randomUUID()}-${safe || 'image'}.${ext}`;
  try {
    const url = await createSignedWriteUrl('chat_media', path, fileType);
    return { path, url };
  } catch (error) {
    console.error('requestMarketImageUploadUrlAction failed', error instanceof Error ? error.message : error);
    return { error: 'uploadFailed' };
  }
}

/**
 * Thrown inside a `sql.begin` callback so the whole transaction rolls back,
 * then translated into an `{ error }` result by the catch below. Module-local
 * on purpose: a `'use server'` module may only *export* async functions.
 */
class MarketError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function marketErrorResult(error: unknown, fallback: string): MarketActionState {
  if (error instanceof MarketError) return { error: error.code };
  console.error('market action failed', error instanceof Error ? error.message : error);
  return { error: fallback };
}

function revalidateMarket() {
  revalidatePath('/[locale]/market', 'page');
  revalidatePath('/[locale]/profile/[id]', 'page');
  revalidatePath('/[locale]/profile', 'page');
}

// `stock` is nullable in the schema and null means UNLIMITED — an empty form
// field therefore has to survive as null rather than collapsing to 0, which
// would mean "out of stock" instead.
const optionalStock = z
  .union([z.literal(''), z.coerce.number().int().min(0)])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

const itemFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  imageUrl: z.string().trim().max(2000).optional().or(z.literal('')),
  starCost: z.coerce.number().int().positive(),
  stock: optionalStock,
  category: z.enum(MARKET_CATEGORIES).default('gift'),
});

/** Employee-side gate: the shop is limited to MARKET_ROLES for now. */
async function requireMarketUser(): Promise<{ id: string } | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!canSeeFor(profile, 'market') && !(await isMarketEditor(user.id))) return { error: 'forbidden' };
  return { id: user.id };
}

/** Item management (add / edit / photo / stars / stock / hide / delete):
 *  'market.manage' holders or a market editor. Order decisions stay
 *  requireCap('market.manage'). */
async function requireMarketEditor() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || (!can(profile.role, 'market.manage') && !(await isMarketEditor(user.id)))) {
    throw new ForbiddenError('Market editor access required');
  }
  return { user, profile };
}

/**
 * Tells everyone who hearted an item that it is back in stock. Called via
 * `after()` only when a stocked item goes from 0 to >0, so a routine +1 on an
 * item that was never empty pings nobody.
 */
async function notifyWishlistRestock(itemId: string) {
  try {
    const rows = await sql<{ telegram_id: number | null; name: string }[]>`
      select p.telegram_id, i.name
      from market_wishlist w
      join profiles p on p.id = w.user_id
      join market_items i on i.id = w.item_id
      where w.item_id = ${itemId} and p.is_active and p.telegram_id is not null
    `;
    for (const r of rows) {
      if (!r.telegram_id) continue;
      await sendTelegramAs('stars', 
        r.telegram_id,
        `<b>Persons Market</b>\nIstaklaringizdagi "${escapeTelegramText(r.name)}" yana mavjud!`,
      );
    }
  } catch (error) {
    console.error('notifyWishlistRestock failed', error instanceof Error ? error.message : error);
  }
}

// ---------------------------------------------------------------------------
// CEO — item curation
// ---------------------------------------------------------------------------

export async function createMarketItemAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  let actorId: string;
  try {
    ({
      user: { id: actorId },
    } = await requireMarketEditor());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = itemFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { name, starCost, stock, category } = parsed.data;

  try {
    await sql`
      insert into market_items (name, description, image_url, star_cost, stock, category, created_by)
      values (
        ${name},
        ${parsed.data.description || null},
        ${parsed.data.imageUrl || null},
        ${starCost},
        ${stock},
        ${category},
        ${actorId}
      )
    `;
  } catch {
    return { error: 'createFailed' };
  }

  logSystemAction('market.item.create', `Created market item "${name}"`);
  revalidateMarket();
  return {};
}

const updateItemSchema = itemFieldsSchema.extend({ itemId: z.string().uuid() });

export async function updateMarketItemAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { itemId, name, starCost, stock, category } = parsed.data;

  let restocked = false;
  try {
    const rows = await sql<{ id: string; old_stock: number | null }[]>`
      with old as (select id, stock from market_items where id = ${itemId})
      update market_items m set
        name        = ${name},
        description = ${parsed.data.description || null},
        image_url   = ${parsed.data.imageUrl || null},
        star_cost   = ${starCost},
        stock       = ${stock},
        category    = ${category},
        updated_at  = now()
      from old
      where m.id = old.id
      returning m.id, old.stock as old_stock
    `;
    if (rows.length === 0) return { error: 'itemNotFound' };
    restocked = rows[0].old_stock === 0 && (stock === null || stock > 0);
  } catch {
    return { error: 'updateFailed' };
  }
  if (restocked) after(() => notifyWishlistRestock(itemId));

  logSystemAction('market.item.update', `Updated market item ${itemId}`);
  revalidateMarket();
  return {};
}

const setActiveSchema = z.object({
  itemId: z.string().uuid(),
  // Checkbox-friendly: a form sends 'on'/'true'/'false', a hidden input sends
  // the string of a boolean.
  isActive: z.union([z.literal('true'), z.literal('on'), z.literal('false'), z.literal('')]),
});

export async function setMarketItemActiveAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = setActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const isActive = parsed.data.isActive === 'true' || parsed.data.isActive === 'on';

  try {
    const rows = await sql<{ id: string }[]>`
      update market_items set
        is_active   = ${isActive},
        -- Switching an archived item back on is the CEO's undo for a mistaken
        -- delete: it has to clear the archive stamp too, or the item would
        -- read as active and still never reach the shop.
        archived_at = case when ${isActive} then null else archived_at end,
        updated_at  = now()
      where id = ${parsed.data.itemId}
      returning id
    `;
    if (rows.length === 0) return { error: 'itemNotFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  revalidateMarket();
  return {};
}

const adjustStockSchema = z.object({
  itemId: z.string().uuid(),
  // Restock (+) or write off (-). Bounded so a fat-fingered hidden field can't
  // invent a thousand units.
  delta: z.coerce.number().int().refine((n) => n !== 0 && Math.abs(n) <= 100),
});

/**
 * One-click restock from the CEO catalog row (+1 / +5 / -1) without opening
 * the full edit dialog. Clamped at 0 — stock is a count, never negative — and
 * a no-op for unlimited items (`stock is null`), which have nothing to restock.
 */
export async function adjustMarketItemStockAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = adjustStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { itemId, delta } = parsed.data;

  let restocked = false;
  try {
    const rows = await sql<{ id: string; stock: number }[]>`
      update market_items
         set stock = greatest(0, stock + ${delta}), updated_at = now()
       where id = ${itemId} and stock is not null
      returning id, stock
    `;
    if (rows.length === 0) return { error: 'itemNotFound' };
    // Went from 0 to exactly `delta` → it was sold out a moment ago.
    restocked = delta > 0 && rows[0].stock === delta;
  } catch {
    return { error: 'updateFailed' };
  }
  if (restocked) after(() => notifyWishlistRestock(itemId));

  logSystemAction('market.item.stock', `Adjusted market item ${itemId} stock by ${delta}`);
  revalidateMarket();
  return {};
}

const restoreItemSchema = z.object({ itemId: z.string().uuid() });

/**
 * Restores an archived market item: sets is_active = true and clears archived_at.
 * Only archived items can be restored.
 */
export async function restoreMarketItemAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = restoreItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { itemId } = parsed.data;

  try {
    const rows = await sql<{ id: string }[]>`
      update market_items
         set is_active = true, archived_at = null, updated_at = now()
       where id = ${itemId} and archived_at is not null
      returning id
    `;
    if (rows.length === 0) return { error: 'itemNotFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction('market.item.restore', `Restored market item ${itemId}`);
  revalidateMarket();
  return {};
}

const deleteItemSchema = z.object({ itemId: z.string().uuid() });

/**
 * Removes a shelf item, choosing the safe removal for the item at hand:
 *
 *  - no orders reference it  → hard `delete`, the row is genuinely gone;
 *  - it has order history    → **archive** (`archived_at = now()`,
 *    `is_active = false`). `market_orders.item_id` is an FK with no cascade
 *    and every one of those rows is an employee's star-spend record, so the
 *    item has to keep existing for "My orders" and the CEO history to resolve
 *    its name. Archived items never appear in the shop again.
 *
 * The result says which happened (`archived: true`) so the UI can report it.
 */
export async function deleteMarketItemAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { itemId } = parsed.data;

  let archived = false;
  try {
    archived = await sql.begin(async (tx) => {
      const [item] = await tx<{ id: string }[]>`
        select id from market_items where id = ${itemId} for update
      `;
      if (!item) throw new MarketError('itemNotFound');

      const [{ count }] = await tx<{ count: number }[]>`
        select count(*)::int as count from market_orders where item_id = ${itemId}
      `;

      if (count > 0) {
        await tx`
          update market_items
             set archived_at = now(), is_active = false, updated_at = now()
           where id = ${itemId}
        `;
        return true;
      }

      await tx`delete from market_items where id = ${itemId}`;
      return false;
    });
  } catch (error) {
    return marketErrorResult(error, 'deleteFailed');
  }

  logSystemAction(
    archived ? 'market.item.archive' : 'market.item.delete',
    `${archived ? 'Archived' : 'Deleted'} market item ${itemId}`,
  );
  revalidateMarket();
  return { archived };
}

// ---------------------------------------------------------------------------
// CEO — order decisions
// ---------------------------------------------------------------------------

const decideSchema = z.object({
  orderId: z.string().uuid(),
  // Exactly two outcomes. ('fulfilled' still exists in the table's CHECK for
  // rows written by the old three-button UI — it is displayed, never written.)
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/** Fire-and-forget buyer notification — mirrors notifyWarningIssued in
 * warnings.ts. The decision has already committed; a Telegram hiccup (or a
 * Cloud Run instance that would otherwise be frozen mid-request) must never
 * turn into an error for the CEO who just clicked Approve. */
async function notifyOrderDecided({
  status,
  itemName,
  starCost,
  note,
  recipientTelegramId,
}: {
  status: 'approved' | 'rejected';
  itemName: string;
  starCost: number;
  note: string | null;
  recipientTelegramId: number | null;
}) {
  if (!recipientTelegramId) return;
  try {
    const text =
      status === 'approved'
        ? `<b>Buyurtmangiz tasdiqlandi</b>\nSovg'a: ${escapeTelegramText(itemName)}` +
          (note ? `\nIzoh: ${escapeTelegramText(note)}` : '')
        : `<b>Buyurtmangiz rad etildi</b>\nSovg'a: ${escapeTelegramText(itemName)}` +
          `\n${starCost} yulduz balansingizga qaytarildi.` +
          (note ? `\nSabab: ${escapeTelegramText(note)}` : '');
    await sendTelegramAs('stars', recipientTelegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * The CEO's two-outcome decision on a pending purchase.
 *
 *  - **approve** — stamps who decided and when. The stars were already spent
 *    when the order was placed (see placeMarketOrderAction), so approving
 *    moves no money; it just releases the reward.
 *  - **reject** — refunds the stars with a matching `refund` ledger row and
 *    puts the unit back on the shelf, leaving the employee exactly where they
 *    started.
 *
 * Both are terminal, and both ping the buyer on Telegram.
 */
export async function decideMarketOrderAction(
  _prevState: MarketActionState,
  formData: FormData,
): Promise<MarketActionState> {
  let actorId: string;
  try {
    ({
      user: { id: actorId },
    } = await requireCap('market.manage'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = decideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { orderId, status } = parsed.data;
  const note = parsed.data.note?.trim() ? parsed.data.note.trim() : null;

  // Carried OUT of the transaction (rather than captured in a `let`, which
  // TypeScript can't narrow across a callback) so the Telegram ping below runs
  // on data that is known to have committed.
  let decided: { itemName: string; starCost: number; telegramId: number | null };

  try {
    decided = await sql.begin(async (tx) => {
      const [order] = await tx<
        {
          id: string;
          item_id: string;
          user_id: string;
          star_cost: number;
          status: string;
          item_name: string;
          telegram_id: number | null;
        }[]
      >`
        select o.id, o.item_id, o.user_id, o.star_cost, o.status, i.name as item_name,
               p.telegram_id
        from market_orders o
        join market_items i on i.id = o.item_id
        join profiles p on p.id = o.user_id
        where o.id = ${orderId}
        for update of o
      `;
      if (!order) throw new MarketError('orderNotFound');
      // Every decision is terminal — only a still-pending order may be
      // decided, or a rejection could refund the same stars twice.
      if (order.status !== 'pending') throw new MarketError('alreadyDecided');

      await tx`
        update market_orders
           set status = ${status}, note = ${note}, decided_by = ${actorId}, decided_at = now()
         where id = ${order.id}
      `;

      if (status === 'rejected') {
        await insertStarTransaction(tx, {
          userId: order.user_id,
          delta: order.star_cost,
          reason: `Persons Market: "${order.item_name}" rad etildi${note ? ` — ${note}` : ''}`,
          sourceType: 'refund',
          sourceId: order.id,
          createdBy: actorId,
        });
        // Only stocked items get the unit back; `stock is null` is unlimited
        // and must stay null.
        await tx`
          update market_items set stock = stock + 1, updated_at = now()
          where id = ${order.item_id} and stock is not null
        `;
      }

      return {
        itemName: order.item_name,
        starCost: order.star_cost,
        telegramId: order.telegram_id,
      };
    });
  } catch (error) {
    return marketErrorResult(error, 'updateFailed');
  }

  logSystemAction('market.order.decide', `Market order ${orderId} -> ${status}`);

  // `after` so the Telegram round-trip runs once the response is on its way —
  // on Cloud Run a bare floating promise can be frozen with the instance.
  after(() =>
    notifyOrderDecided({
      status,
      itemName: decided.itemName,
      starCost: decided.starCost,
      note,
      recipientTelegramId: decided.telegramId,
    }),
  );

  revalidateMarket();
  return {};
}

// ---------------------------------------------------------------------------
// Employee — ordering
// ---------------------------------------------------------------------------

/**
 * Places an order and debits the stars in the SAME transaction: the ledger
 * row, the order row and the stock decrement either all land or none do, so
 * a double-click can never spend stars without producing an order (or the
 * reverse). The row lock on the item is what serialises two employees racing
 * for the last unit.
 */
export async function placeMarketOrderAction(itemId: string): Promise<MarketActionState> {
  const user = await requireMarketUser();
  if ('error' in user) return { error: user.error };

  const parsedId = z.string().uuid().safeParse(itemId);
  if (!parsedId.success) return { error: 'invalidInput' };

  // Cheap pre-check on the shared client so the common "can't afford it"
  // case never opens a transaction; the authoritative check is inside it.
  const balance = await getStarBalance(user.id);

  try {
    await sql.begin(async (tx) => {
      // Serialise every balance-spending order *per buyer*. The item lock
      // below only serialises buyers of the same item — two orders for two
      // different items by the same person each read the same pre-purchase
      // balance and could both go through, pushing it negative.
      await tx`select id from profiles where id = ${user.id} for update`;

      const [item] = await tx<
        {
          id: string;
          name: string;
          star_cost: number;
          stock: number | null;
          is_active: boolean;
          archived_at: string | null;
        }[]
      >`
        select id, name, star_cost, stock, is_active, archived_at
        from market_items where id = ${parsedId.data}
        for update
      `;
      if (!item) throw new MarketError('itemNotFound');
      if (!item.is_active || item.archived_at !== null) throw new MarketError('itemInactive');
      if (item.stock !== null && item.stock <= 0) throw new MarketError('outOfStock');
      if (balance < item.star_cost) throw new MarketError('insufficientStars');

      // Re-read the balance inside the transaction: the pre-check above is a
      // snapshot from before the lock, and a concurrent purchase or CEO
      // deduction in between must not be allowed to push it negative.
      const [live] = await tx<{ balance: number }[]>`
        select coalesce(sum(delta), 0)::int as balance
        from star_transactions where user_id = ${user.id}
      `;
      if ((live?.balance ?? 0) < item.star_cost) throw new MarketError('insufficientStars');

      const [order] = await tx<{ id: string }[]>`
        insert into market_orders (item_id, user_id, star_cost, status)
        values (${item.id}, ${user.id}, ${item.star_cost}, 'pending')
        returning id
      `;

      await insertStarTransaction(tx, {
        userId: user.id,
        delta: -item.star_cost,
        reason: `Persons Market: "${item.name}"`,
        sourceType: 'purchase',
        sourceId: order.id,
        createdBy: null,
      });

      if (item.stock !== null) {
        await tx`update market_items set stock = stock - 1, updated_at = now() where id = ${item.id}`;
      }
    });
  } catch (error) {
    return marketErrorResult(error, 'createFailed');
  }

  logSystemAction('market.order.create', `Placed a market order for item ${parsedId.data}`);
  revalidateMarket();
  return {};
}

/**
 * An employee withdraws their own still-pending order: status → cancelled,
 * the stars come back as a `refund` ledger row and the unit returns to the
 * shelf — all in one transaction, under the buyer's row lock like a purchase.
 */
export async function cancelMarketOrderAction(orderId: string): Promise<MarketActionState> {
  const user = await requireMarketUser();
  if ('error' in user) return { error: user.error };

  const parsedId = z.string().uuid().safeParse(orderId);
  if (!parsedId.success) return { error: 'invalidInput' };

  try {
    await sql.begin(async (tx) => {
      await tx`select id from profiles where id = ${user.id} for update`;
      const rows = await tx<{ id: string; item_id: string; star_cost: number; item_name: string }[]>`
        update market_orders o
           set status = 'cancelled', decided_at = now()
          from market_items i
         where o.id = ${parsedId.data} and o.user_id = ${user.id}
           and o.status = 'pending' and i.id = o.item_id
        returning o.id, o.item_id, o.star_cost, i.name as item_name
      `;
      // 0 rows: not theirs, or the CEO decided it a moment ago.
      if (rows.length === 0) throw new MarketError('alreadyDecided');
      const order = rows[0];

      await insertStarTransaction(tx, {
        userId: user.id,
        delta: order.star_cost,
        reason: `Persons Market: "${order.item_name}" bekor qilindi`,
        sourceType: 'refund',
        sourceId: order.id,
        createdBy: user.id,
      });
      await tx`
        update market_items set stock = stock + 1, updated_at = now()
        where id = ${order.item_id} and stock is not null
      `;
    });
  } catch (error) {
    return marketErrorResult(error, 'updateFailed');
  }

  logSystemAction('market.order.cancel', `Cancelled own market order ${parsedId.data}`);
  revalidateMarket();
  return {};
}

/** Hearts / un-hearts an item. Returns the new state so the UI can settle. */
export async function toggleMarketWishlistAction(
  itemId: string,
): Promise<{ error?: string; wishlisted?: boolean }> {
  const user = await requireMarketUser();
  if ('error' in user) return { error: user.error };

  const parsedId = z.string().uuid().safeParse(itemId);
  if (!parsedId.success) return { error: 'invalidInput' };

  let wishlisted = true;
  try {
    const removed = await sql`
      delete from market_wishlist where user_id = ${user.id} and item_id = ${parsedId.data}
    `;
    if (removed.count > 0) {
      wishlisted = false;
    } else {
      await sql`
        insert into market_wishlist (user_id, item_id) values (${user.id}, ${parsedId.data})
        on conflict do nothing
      `;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  revalidateMarket();
  return { wishlisted };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type MarketItemRow = {
  id: string;
  name: string;
  description: string | null;
  /** Signed, short-lived URL ready to drop into an <img src>. Re-minted every fetch. */
  image_url: string | null;
  /** The value actually stored in the DB — a bucket object path or a legacy http(s)
   *  URL. This is what an edit form must submit back when the image is unchanged;
   *  never round-trip `image_url`, it expires. */
  image_path: string | null;
  star_cost: number;
  stock: number | null;
  is_active: boolean;
  category: MarketCategory;
  /** Whether the viewer hearted it (shop view only; false in the CEO catalog). */
  wishlisted: boolean;
  /** How many employees hearted it (CEO catalog only; 0 in the shop). */
  wishlist_count: number;
  /** Non-null once the CEO removed an item that had order history. Never
   *  reaches the shop; shown in the CEO catalog so the row can be restored. */
  archived_at: string | null;
};

export type MarketOrderRow = {
  id: string;
  item_id: string;
  item_name: string;
  star_cost: number;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
  note: string | null;
  created_at: string;
  decided_at: string | null;
};

export type MarketView = {
  balance: number;
  items: MarketItemRow[];
  orders: MarketOrderRow[];
};

const EMPTY_MARKET: MarketView = { balance: 0, items: [], orders: [] };

/** What an employee sees: the shelf, their own orders, their own balance. */
export async function getMarketAction(): Promise<MarketView> {
  const user = await requireMarketUser();
  if ('error' in user) return EMPTY_MARKET;

  const [balance, items, orders] = await Promise.all([
    getStarBalance(user.id),
    sql<MarketItemRow[]>`
      select i.id, i.name, i.description, i.image_url, i.star_cost, i.stock, i.is_active,
             i.archived_at, i.category, 0 as wishlist_count,
             exists (select 1 from market_wishlist w
                      where w.item_id = i.id and w.user_id = ${user.id}) as wishlisted
      from market_items i
      where is_active = true and archived_at is null
      order by star_cost asc, created_at desc
    `,
    sql<MarketOrderRow[]>`
      select o.id, o.item_id, i.name as item_name, o.star_cost, o.status, o.note, o.created_at, o.decided_at
      from market_orders o
      join market_items i on i.id = o.item_id
      where o.user_id = ${user.id}
      order by o.created_at desc
      limit 50
    `,
  ]);

  const itemsWithImages = await Promise.all(
    items.map(async (i) => ({
      ...i,
      image_path: i.image_url,
      image_url: await resolveImage(i.image_url),
    })),
  );
  return { balance, items: itemsWithImages, orders };
}

export type MarketAdminOrderRow = MarketOrderRow & {
  user_id: string;
  first_name: string;
  last_name: string;
};

export type MarketAdminView = {
  /** False for anyone but the CEO — the caller renders nothing rather than
   * getting an exception out of a read. */
  allowed: boolean;
  items: MarketItemRow[];
  pendingOrders: MarketAdminOrderRow[];
  /** Everything already decided, newest first — who ordered what, when, and
   *  how it ended. Capped: this is a review panel, not an export. */
  decidedOrders: MarketAdminOrderRow[];
  /** Stars actually spent (approved orders) versus refunded (rejected). */
  stats: { pending: number; approved: number; rejected: number; starsSpent: number };
};

const EMPTY_ADMIN_VIEW: MarketAdminView = {
  allowed: false,
  items: [],
  pendingOrders: [],
  decidedOrders: [],
  stats: { pending: 0, approved: 0, rejected: 0, starsSpent: 0 },
};

/** What the CEO sees: every item (inactive + archived included), the pending
 *  queue, and the decided-order history. */
export async function getMarketAdminAction(): Promise<MarketAdminView> {
  let isCeo: boolean;
  try {
    isCeo = can((await requireMarketEditor()).profile.role, 'market.manage');
  } catch {
    return EMPTY_ADMIN_VIEW;
  }

  const [items, orders, [stats]] = await Promise.all([
    sql<MarketItemRow[]>`
      select i.id, i.name, i.description, i.image_url, i.star_cost, i.stock, i.is_active,
             i.archived_at, i.category, false as wishlisted,
             (select count(*)::int from market_wishlist w where w.item_id = i.id) as wishlist_count
      from market_items i
      order by (archived_at is not null) asc, is_active desc, created_at desc
    `,
    sql<MarketAdminOrderRow[]>`
      select o.id, o.item_id, i.name as item_name, o.star_cost, o.status, o.note,
             o.created_at, o.decided_at, o.user_id, p.first_name, p.last_name
      from market_orders o
      join market_items i on i.id = o.item_id
      join profiles p on p.id = o.user_id
      where o.status = 'pending'
         or o.decided_at >= now() - interval '180 days'
      order by o.created_at desc
      limit 200
    `,
    sql<{ pending: number; approved: number; rejected: number; stars_spent: number }[]>`
      select
        count(*) filter (where status = 'pending')::int  as pending,
        count(*) filter (where status in ('approved','fulfilled'))::int as approved,
        count(*) filter (where status = 'rejected')::int as rejected,
        coalesce(sum(star_cost) filter (where status in ('approved','fulfilled')), 0)::int as stars_spent
      from market_orders
    `,
  ]);

  const itemsWithImages = await Promise.all(
    items.map(async (i) => ({
      ...i,
      image_path: i.image_url,
      image_url: await resolveImage(i.image_url),
    })),
  );

  return {
    allowed: true,
    items: itemsWithImages,
    // One query, split here — the pending queue is ordered oldest-first (a
    // work queue), the history newest-first (a log).
    // Market editors manage items only — orders (who bought what, star
    // decisions) stay with the CEO.
    pendingOrders: isCeo ? orders.filter((o) => o.status === 'pending').reverse() : [],
    decidedOrders: isCeo ? orders.filter((o) => o.status !== 'pending') : [],
    stats: isCeo ? {
      pending: stats?.pending ?? 0,
      approved: stats?.approved ?? 0,
      rejected: stats?.rejected ?? 0,
      starsSpent: stats?.stars_spent ?? 0,
    } : EMPTY_ADMIN_VIEW.stats,
  };
}

/* ------------------------------------------------------------ v7: hand-over + insights */

async function requireMarketCeo(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('market.manage');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

/** Approved → handed over (or back, as the undo). Pings the buyer. */
export async function setMarketOrderFulfilledAction(orderId: string, fulfilled: boolean): Promise<MarketActionState> {
  const g = await requireMarketCeo();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(orderId).success) return { error: 'invalidInput' };
  let row: { user_id: string; name: string } | undefined;
  try {
    [row] = await sql<{ user_id: string; name: string }[]>`
      update market_orders o set status = ${fulfilled ? 'fulfilled' : 'approved'}
      from market_items i
      where o.id = ${orderId} and i.id = o.item_id and o.status = ${fulfilled ? 'approved' : 'fulfilled'}
      returning o.user_id, i.name`;
  } catch {
    return { error: 'updateFailed' };
  }
  if (!row) return { error: 'invalidTransition' };
  const r = row;
  if (fulfilled)
    after(async () => {
      const [p] = await sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where id = ${r.user_id}`;
      if (p?.telegram_id) await sendTelegramAs('stars', p.telegram_id, `🎁 <b>${escapeTelegramText(r.name)}</b> sizga topshirildi. Yoqimli foydalaning!`).catch(() => {});
    });
  logSystemAction('market.fulfil', `${orderId} → ${fulfilled ? 'fulfilled' : 'approved'}`);
  revalidatePath('/[locale]/market', 'page');
  return {};
}

const stockAlertSchema = z.object({ itemId: z.string().uuid(), lowStock: z.number().int().min(0).max(1000) });

export async function setMarketLowStockAction(input: z.input<typeof stockAlertSchema>): Promise<MarketActionState> {
  try {
    await requireMarketEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = stockAlertSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`update market_items set low_stock = ${p.data.lowStock} where id = ${p.data.itemId}`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/market', 'page');
  return {};
}

export type MarketInsights = {
  months: { month: string; stars: number; orders: number }[];
  top: { name: string; orders: number; stars: number }[];
  wished: { id: string; name: string; wishes: number; stock: number; star_cost: number }[];
  categories: { category: string; orders: number; stars: number }[];
  lowStock: { id: string; name: string; stock: number; low_stock: number; wishes: number }[];
  handover: { id: string; item: string; who: string; approved_at: string | null }[];
  avgDecisionHours: number | null;
  buyers: number;
  handoverCount: number;
};

/** CEO view of the shop: spend trend, best sellers, unmet wishes, stock. */
export async function getMarketInsightsAction(): Promise<MarketInsights | null> {
  const g = await requireMarketCeo();
  if ('error' in g) return null;
  const [months, top, wished, categories, lowStock, handover, [avg], [buyers], [hc]] = await Promise.all([
    sql<{ month: string; stars: number; orders: number }[]>`
      select to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month,
        coalesce(sum(star_cost) filter (where status in ('approved', 'fulfilled')), 0)::int as stars,
        count(*) filter (where status in ('approved', 'fulfilled'))::int as orders
      from market_orders where created_at >= now() - interval '6 months' group by 1 order by 1`,
    sql<{ name: string; orders: number; stars: number }[]>`
      select i.name, count(*)::int as orders, sum(o.star_cost)::int as stars
      from market_orders o join market_items i on i.id = o.item_id
      where o.status in ('approved', 'fulfilled') and o.created_at >= now() - interval '180 days'
      group by i.name order by orders desc limit 8`,
    sql<{ id: string; name: string; wishes: number; stock: number; star_cost: number }[]>`
      select i.id, i.name, count(w.*)::int as wishes, i.stock, i.star_cost
      from market_items i join market_wishlist w on w.item_id = i.id
      where i.archived_at is null group by i.id order by wishes desc limit 8`,
    sql<{ category: string; orders: number; stars: number }[]>`
      select coalesce(i.category, 'other') as category, count(*)::int as orders, sum(o.star_cost)::int as stars
      from market_orders o join market_items i on i.id = o.item_id
      where o.status in ('approved', 'fulfilled') and o.created_at >= now() - interval '180 days'
      group by 1 order by orders desc`,
    sql<{ id: string; name: string; stock: number; low_stock: number; wishes: number }[]>`
      select i.id, i.name, i.stock, i.low_stock, (select count(*)::int from market_wishlist w where w.item_id = i.id) as wishes
      from market_items i where i.is_active and i.archived_at is null and i.stock <= i.low_stock
      order by i.stock, wishes desc`,
    sql<{ id: string; item: string; who: string; approved_at: string | null }[]>`
      select o.id, i.name as item, trim(concat(p.first_name, ' ', p.last_name)) as who, o.decided_at as approved_at
      from market_orders o join market_items i on i.id = o.item_id join profiles p on p.id = o.user_id
      where o.status = 'approved' order by o.decided_at nulls last limit 50`,
    sql<{ h: number | null }[]>`
      select avg(extract(epoch from decided_at - created_at) / 3600)::float8 as h
      from market_orders where decided_at is not null and created_at >= now() - interval '90 days'`,
    sql<{ n: number }[]>`
      select count(distinct user_id)::int as n from market_orders
      where status in ('approved', 'fulfilled') and created_at >= now() - interval '90 days'`,
    sql<{ n: number }[]>`select count(*)::int as n from market_orders where status = 'approved'`,
  ]);
  return { months, top, wished, categories, lowStock, handover, avgDecisionHours: avg?.h ?? null, buyers: buyers?.n ?? 0, handoverCount: hc?.n ?? 0 };
}
