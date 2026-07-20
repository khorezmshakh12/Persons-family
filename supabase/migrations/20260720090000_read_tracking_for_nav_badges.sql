-- Replaces the sidebar's "created in the last 24h" nav-badge heuristic
-- with genuine per-user read tracking, so a badge actually clears once the
-- relevant page has been visited instead of just aging out after a day.

-- Tasks: per-assignee "seen" tracking, mirroring issues.is_seen exactly
-- (same reset-on-reassign trigger, same bulk mark-seen RPC shape).
alter table tasks add column is_seen boolean not null default false;

create or replace function public.reset_task_seen_on_reassign()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    new.is_seen = false;
  end if;
  return new;
end;
$$;

create trigger reset_task_seen_on_reassign_trigger
  before update on tasks
  for each row execute function public.reset_task_seen_on_reassign();

create or replace function public.mark_tasks_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update tasks set is_seen = true where assigned_to = auth.uid() and is_seen = false;
$$;

grant execute on function public.mark_tasks_seen() to authenticated;

-- Company news: broadcast to every active staff member, so unlike tasks/
-- issues (single assignee) a plain boolean column on the row can't record
-- "read" per viewer — needs a join table instead.
create table company_news_reads (
  news_id uuid not null references company_news (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (news_id, user_id)
);

alter table company_news_reads enable row level security;

create policy "company_news_reads_select_own"
  on company_news_reads for select
  to authenticated
  using (user_id = auth.uid());

create policy "company_news_reads_insert_own"
  on company_news_reads for insert
  to authenticated
  with check (user_id = auth.uid());

-- Marks every currently-visible post (last 7 days — mirrors
-- companyNewsCutoff() in src/lib/company-news.ts) as read for the caller.
create or replace function public.mark_company_news_seen()
returns void
language sql
security definer
set search_path = public
as $$
  insert into company_news_reads (news_id, user_id)
  select id, auth.uid() from company_news
  where created_at >= now() - interval '7 days'
  on conflict (news_id, user_id) do nothing;
$$;

grant execute on function public.mark_company_news_seen() to authenticated;

-- Powers the sidebar's Company News dot: count of posts from the last 7
-- days the caller has not yet read.
create or replace function public.unseen_company_news_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from company_news cn
  where cn.created_at >= now() - interval '7 days'
    and not exists (
      select 1 from company_news_reads r where r.news_id = cn.id and r.user_id = auth.uid()
    );
$$;

grant execute on function public.unseen_company_news_count() to authenticated;
