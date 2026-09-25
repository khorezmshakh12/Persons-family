-- ==========================================================================
-- Strategy suite — last prototype leftovers on real data:
--   * acct_courses.teacher_share  — optional teacher share of course revenue
--     (%). When set, teacher_cost is derived from it on save (fee × students
--     × share); NULL keeps the fixed monthly teacher cost.
--   * acct_courses.hours_month    — lesson hours per month (groups × hours),
--     drives "1 dars soati tannarxi" and the segment P&L "Soat/oy" column.
--   * pf_risks                    — ISO 31000 risk register (likelihood ×
--     impact, treatment, owner, review date) with a post-mortem once a risk
--     has materialised (Perforce → ALM · Sifat).
-- Additive / IF NOT EXISTS, safe to re-run.
-- ==========================================================================

begin;

create extension if not exists pgcrypto;

alter table acct_courses add column if not exists teacher_share numeric(5, 2)
  check (teacher_share is null or (teacher_share >= 0 and teacher_share <= 100));
alter table acct_courses add column if not exists hours_month numeric(8, 1) not null default 0
  check (hours_month >= 0);

create table if not exists pf_risks (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid references strategy_spaces(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 300),
  category    text not null default 'operational'
              check (category in ('strategic', 'operational', 'financial', 'compliance', 'people', 'technology')),
  likelihood  int not null default 3 check (likelihood between 1 and 5),
  impact      int not null default 3 check (impact between 1 and 5),
  treatment   text not null default 'reduce' check (treatment in ('avoid', 'reduce', 'transfer', 'accept')),
  mitigation  text not null default '' check (char_length(mitigation) <= 2000),
  owner_id    uuid references profiles(id) on delete set null,
  review_date date,
  status      text not null default 'open' check (status in ('open', 'monitoring', 'closed', 'occurred')),
  postmortem  text not null default '' check (char_length(postmortem) <= 4000),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pf_risks_space_idx on pf_risks (space_id);

commit;
