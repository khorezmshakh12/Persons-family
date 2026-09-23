-- ===========================================================================
-- Persons Market — archiving + order history
--
-- 1. `market_items.archived_at` — a CEO "delete" on an item that already has
--    orders must NOT destroy those rows: `market_orders.item_id` is an FK with
--    no cascade and every one of them is an employee's star-spend record.
--    Archiving takes the item off the shelf for good while the history keeps
--    resolving `i.name`. A hard delete stays possible, but only for an item
--    nothing references (handled in deleteMarketItemAction).
--
-- 2. An index on `market_orders (item_id)` — the delete/archive decision does
--    `count(*) where item_id = $1` on every attempt, and the new CEO order
--    history joins back to items.
--
-- The order status vocabulary is unchanged: 'pending' | 'approved' |
-- 'rejected' | 'fulfilled' already exists from 20260901000000. The CEO UI now
-- only ever writes 'approved' or 'rejected'; 'fulfilled' is retained purely so
-- rows written by the previous UI still satisfy the CHECK and still render.
--
-- Idempotent: re-running this is a no-op.
-- ===========================================================================

begin;

alter table market_items
  add column if not exists archived_at timestamptz;

comment on column market_items.archived_at is
  'Set when the CEO removes an item that already has orders. Archived items are hidden from the shop and is_active is forced false; switching the item back to Active in the CEO catalog clears it.';

-- An archived item must never be reachable from the shop, whatever a later
-- "activate" toggle does. Backfill is a no-op on a fresh column but keeps the
-- invariant true if this ever runs after a partial deploy.
update market_items
   set is_active = false
 where archived_at is not null
   and is_active = true;

create index if not exists market_orders_item_idx on market_orders (item_id);

-- The shop read is `where is_active and archived_at is null order by star_cost`.
create index if not exists market_items_shelf_idx
  on market_items (is_active, archived_at, star_cost);

commit;
