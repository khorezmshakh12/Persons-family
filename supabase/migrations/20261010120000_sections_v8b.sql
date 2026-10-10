-- Sections v8-B (2026-10-10): Hisob-kitob (receipts, recurring templates)
-- and the Telegram centre (delivery failure log).
begin;

-- A photo / PDF of the receipt behind a cash movement (contract-files bucket,
-- receipts/<entry id>/…).
alter table acct_entries add column if not exists receipt_path text;

-- Attaching a receipt is not a change to the books: allow it in a closed
-- month. Everything else stays locked exactly as before.
create or replace function acct_entries_close_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and row(new.entry_date, new.doc, new.description, new.debit, new.credit, new.amount, new.source)
         is not distinct from row(old.entry_date, old.doc, old.description, old.debit, old.credit, old.amount, old.source) then
    return new;
  end if;
  -- Serialise with a concurrent close of the same month (the first close
  -- has no acct_periods row to FOR SHARE yet).
  if tg_op in ('UPDATE', 'DELETE') then
    perform pg_advisory_xact_lock(hashtext('acct-close:' || to_char(old.entry_date, 'YYYY-MM')));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform pg_advisory_xact_lock(hashtext('acct-close:' || to_char(new.entry_date, 'YYYY-MM')));
  end if;
  if (tg_op in ('UPDATE', 'DELETE') and acct_month_closed(old.entry_date))
     or (tg_op in ('INSERT', 'UPDATE') and acct_month_closed(new.entry_date)) then
    raise exception 'period_closed' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

-- Monthly recurring cash movements (rent, internet…): applied per month on
-- demand; the entry's doc carries 'TPL:<id>' so a month gets each once.
create table if not exists acct_templates (
  id uuid primary key default gen_random_uuid(),
  cat text not null,
  method text not null,
  amount numeric(16, 2) not null check (amount > 0),
  note text not null default '',
  day smallint not null default 1 check (day between 1 and 28),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Telegram sends that failed (blocked bot, deleted account…), for
-- Platform › Telegram. Pruned after 30 days.
create table if not exists telegram_failures (
  id bigserial primary key,
  chat_id bigint,
  error text not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_failures_at_idx on telegram_failures (created_at desc);

commit;
