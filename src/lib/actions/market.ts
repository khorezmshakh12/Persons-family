'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { getStarBalance } from '@/lib/stars';
import { insertStarTransaction } from '@/lib/stars-write';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { createSignedReadUrl, createSignedWriteUrl } from '@/lib/gcp/storage';

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
    await requireCeo();
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
});

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
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = itemFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { name, starCost, stock } = parsed.data;

  try {
    await sql`
      insert into market_items (name, description, image_url, star_cost, stock, created_by)
      values (
        ${name},
        ${parsed.data.description || null},
        ${parsed.data.imageUrl || null},
        ${starCost},
        ${stock},
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
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { itemId, name, starCost, stock } = parsed.data;

  try {
    const rows = await sql<{ id: string }[]>`
      update market_items set
        name        = ${name},
        description = ${parsed.data.description || null},
        image_url   = ${parsed.data.imageUrl || null},
        star_cost   = ${starCost},
        stock       = ${stock},
        updated_at  = now()
      where id = ${itemId}
      returning id
    `;
    if (rows.length === 0) return { error: 'itemNotFound' };
  } catch {
    return { error: 'updateFailed' };
  }

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
    await requireCeo();
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
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = adjustStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  const { itemId, delta } = parsed.data;

  try {
    const rows = await sql<{ id: string }[]>`
      update market_items
         set stock = greatest(0, stock + ${delta}), updated_at = now()
       where id = ${itemId} and stock is not null
      returning id
    `;
    if (rows.length === 0) return { error: 'itemNotFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction('market.item.stock', `Adjusted market item ${itemId} stock by ${delta}`);
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
    await requireCeo();
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
    await sendTelegramMessage(recipientTelegramId, text);
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
    } = await requireCeo());
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
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsedId = z.string().uuid().safeParse(itemId);
  if (!parsedId.success) return { error: 'invalidInput' };

  // Cheap pre-check on the shared client so the common "can't afford it"
  // case never opens a transaction; the authoritative check is inside it.
  const balance = await getStarBalance(user.id);

  try {
    await sql.begin(async (tx) => {
      const [item] = await tx<
        { id: string; name: string; star_cost: number; stock: number | null; is_active: boolean }[]
      >`
        select id, name, star_cost, stock, is_active
        from market_items where id = ${parsedId.data}
        for update
      `;
      if (!item) throw new MarketError('itemNotFound');
      if (!item.is_active) throw new MarketError('itemInactive');
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
  /** Non-null once the CEO removed an item that had order history. Never
   *  reaches the shop; shown in the CEO catalog so the row can be restored. */
  archived_at: string | null;
};

export type MarketOrderRow = {
  id: string;
  item_id: string;
  item_name: string;
  star_cost: number;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled';
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
  const { user } = await getAuthState();
  if (!user) return EMPTY_MARKET;

  const [balance, items, orders] = await Promise.all([
    getStarBalance(user.id),
    sql<MarketItemRow[]>`
      select id, name, description, image_url, star_cost, stock, is_active, archived_at
      from market_items
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
  try {
    await requireCeo();
  } catch {
    return EMPTY_ADMIN_VIEW;
  }

  const [items, orders, [stats]] = await Promise.all([
    sql<MarketItemRow[]>`
      select id, name, description, image_url, star_cost, stock, is_active, archived_at
      from market_items
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
    pendingOrders: orders.filter((o) => o.status === 'pending').reverse(),
    decidedOrders: orders.filter((o) => o.status !== 'pending'),
    stats: {
      pending: stats?.pending ?? 0,
      approved: stats?.approved ?? 0,
      rejected: stats?.rejected ?? 0,
      starsSpent: stats?.stars_spent ?? 0,
    },
  };
}
