-- Company News feed.
create table company_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table company_news enable row level security;

create policy "company_news_select"
  on company_news for select
  to authenticated
  using (true);

create policy "company_news_insert_admin"
  on company_news for insert
  to authenticated
  with check (public.is_admin());

-- Replace the 5-star rating system with an A/B/C tier + 6-month
-- progression cycle. Existing RLS on staff_performance is column-agnostic
-- (references the row's staff_id/is_admin(), not specific columns) so it
-- needs no changes.
create type staff_tier as enum ('A', 'B', 'C');

alter table staff_performance drop column rating;

alter table staff_performance
  add column current_tier staff_tier not null default 'C',
  add column months_in_tier smallint not null default 0 check (months_in_tier between 0 and 6),
  add column weekly_progress_score smallint not null default 0 check (weekly_progress_score between 0 and 100);
