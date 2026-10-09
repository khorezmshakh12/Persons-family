-- ==========================================================================
-- Sections v7: Perforce project status updates, accounting period close,
-- Market stock alerts.
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

-- Perforce: weekly RAG status per project (Asana-style status updates).
create table if not exists pf_status_updates (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references strategy_spaces(id) on delete cascade,
  rag        text not null check (rag in ('green', 'amber', 'red')),
  summary    text not null check (char_length(summary) between 1 and 2000),
  next_steps text not null default '',
  author_id  uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pf_status_space on pf_status_updates (space_id, created_at desc);

-- Accounting: month close. A closed month's journal is frozen in the DB
-- (trigger raises 'period_closed'); reopening needs a reason and is logged.
create table if not exists acct_periods (
  month         date primary key,          -- first day of the month
  closed_at     timestamptz,
  closed_by     uuid references profiles(id) on delete set null,
  budget_review boolean not null default false,
  note          text
);

create table if not exists acct_period_log (
  id         uuid primary key default gen_random_uuid(),
  month      date not null,
  actor      uuid references profiles(id) on delete set null,
  action     text not null check (action in ('close', 'reopen', 'review')),
  reason     text,
  created_at timestamptz not null default now()
);

create or replace function acct_month_closed(d date) returns boolean
language sql volatile as $$
  select coalesce((select closed_at is not null from acct_periods where month = date_trunc('month', d)::date for share), false)
$$;

create or replace function acct_entries_close_guard() returns trigger
language plpgsql as $$
begin
  if (tg_op in ('UPDATE', 'DELETE') and acct_month_closed(old.entry_date))
     or (tg_op in ('INSERT', 'UPDATE') and acct_month_closed(new.entry_date)) then
    raise exception 'period_closed' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_acct_entries_close on acct_entries;
create trigger trg_acct_entries_close
  before insert or update or delete on acct_entries
  for each row execute function acct_entries_close_guard();

-- Market: low-stock threshold per item.
alter table market_items add column if not exists low_stock int not null default 2;

commit;
