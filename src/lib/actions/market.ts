'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { getStarBalance } from '@/lib/stars';
import { insertStarTransaction } from '@/lib/stars-write';
import { createSignedReadUrl, createSignedWriteUrl } from '@/lib/gcp/storage';

export type MarketActionState = { error?: string } | undefined;

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
      update market_items set is_active = ${isActive}, updated_at = now()
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

// ---------------------------------------------------------------------------
// CEO — order decisions
// ---------------------------------------------------------------------------

const decideSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['approved', 'rejected', 'fulfilled']),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * Approving/fulfilling only stamps who decided and when — the stars were
 * already spent when the order was placed. **Rejecting refunds them** with a
 * matching `refund` ledger row and puts the unit back on the shelf, so a
 * rejected order leaves the employee exactly where they started.
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

  try {
    await sql.begin(async (tx) => {
      const [order] = await tx<
        { id: string; item_id: string; user_id: string; star_cost: number; status: string; item_name: string }[]
      >`
        select o.id, o.item_id, o.user_id, o.star_cost, o.status, i.name as item_name
        from market_orders o
        join market_items i on i.id = o.item_id
        where o.id = ${orderId}
        for update of o
      `;
      if (!order) throw new MarketError('orderNotFound');
      // 'rejected' and 'fulfilled' are terminal — re-deciding a rejected
      // order would refund a second time.
      if (order.status === 'rejected' || order.status === 'fulfilled') {
        throw new MarketError('alreadyDecided');
      }
      if (status === 'approved' && order.status !== 'pending') throw new MarketError('alreadyDecided');

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
    });
  } catch (error) {
    return marketErrorResult(error, 'updateFailed');
  }

  logSystemAction('market.order.decide', `Market order ${orderId} -> ${status}`);
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
      select id, name, description, image_url, star_cost, stock, is_active
      from market_items
      where is_active = true
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
};

/** What the CEO sees: every item (inactive included) + every pending order. */
export async function getMarketAdminAction(): Promise<MarketAdminView> {
  try {
    await requireCeo();
  } catch {
    return { allowed: false, items: [], pendingOrders: [] };
  }

  const [items, pendingOrders] = await Promise.all([
    sql<MarketItemRow[]>`
      select id, name, description, image_url, star_cost, stock, is_active
      from market_items
      order by is_active desc, created_at desc
    `,
    sql<MarketAdminOrderRow[]>`
      select o.id, o.item_id, i.name as item_name, o.star_cost, o.status, o.note,
             o.created_at, o.decided_at, o.user_id, p.first_name, p.last_name
      from market_orders o
      join market_items i on i.id = o.item_id
      join profiles p on p.id = o.user_id
      where o.status = 'pending'
      order by o.created_at asc
    `,
  ]);

  const itemsWithImages = await Promise.all(
    items.map(async (i) => ({
      ...i,
      image_path: i.image_url,
      image_url: await resolveImage(i.image_url),
    })),
  );
  return { allowed: true, items: itemsWithImages, pendingOrders };
}
