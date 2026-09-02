-- ==========================================================================
-- Income Roadmap — rebuild on a month-grid model.
--
-- The old shape (`staff_income_plans` + `income_roadmap_steps`) could only
-- express "a base salary, a year-end number, and some loose amounts". It had
-- no month-by-month plan, no actuals, so no plan-vs-actual, no growth rate,
-- no cumulative view, and nothing tying a step to what drives the income.
--
-- The new shape:
--   income_roadmaps            one per (staff, year) — baseline + headline
--                              target + status. The year is stored, so past
--                              years stay queryable instead of being derived
--                              from "now" and lost.
--   income_roadmap_months      the 12-month grid: a *planned* figure set up
--                              front and an *actual* figure recorded as each
--                              month closes. Everything the UI shows
--                              (variance, MoM growth %, cumulative plan vs
--                              cumulative actual, attainment) is derived
--                              from these two columns — nothing derived is
--                              stored.
--   income_roadmap_milestones  named checkpoints anchored to a month of the
--                              roadmap's year: title, the income level it
--                              represents, the criteria/what-it-takes note,
--                              and a status.
--
-- Existing data is migrated, not dropped. The old tables are left in place
-- (read-only from the app's point of view) so this migration is reversible
-- by simply pointing the code back at them; a follow-up migration can drop
-- them once this has been live for a release.
--
-- Every statement is additive / IF NOT EXISTS and the backfills are guarded
-- by `on conflict do nothing`, so the file is safe to re-run.
-- ==========================================================================

begin;

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. Roadmap header — one per staff member per year.
-- --------------------------------------------------------------------------
create table if not exists income_roadmaps (
  id                      uuid primary key default gen_random_uuid(),
  staff_id                uuid not null references profiles(id) on delete cascade,
  year                    integer not null check (year between 2020 and 2100),
  -- Where the employee stood when the roadmap was drawn up. Kept as its own
  -- column (rather than "month 1 planned") so the baseline is a stable
  -- snapshot even after the plan is re-cut mid-year.
  baseline_monthly_income numeric(14, 2) not null default 0 check (baseline_monthly_income >= 0),
  -- The headline ambition for December. The month grid is the path to it;
  -- this is the stated goal, and the two can legitimately disagree while a
  -- plan is being drafted.
  target_year_end_income  numeric(14, 2) not null default 0 check (target_year_end_income >= 0),
  status                  text not null default 'active'
                            check (status in ('draft', 'active', 'archived')),
  notes                   text,
  created_by              uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (staff_id, year)
);

create index if not exists income_roadmaps_staff_year_idx
  on income_roadmaps (staff_id, year desc);

-- --------------------------------------------------------------------------
-- 2. The 12-month grid — planned vs actual.
--    `month_number` is 1..12 within the roadmap's year: an integer, not a
--    date, so nothing here can drift between UTC and Asia/Tashkent.
--    `actual_income` stays NULL until the month closes and the CEO records
--    it — NULL is "not reported yet", 0 is a real reported zero.
-- --------------------------------------------------------------------------
create table if not exists income_roadmap_months (
  id                 uuid primary key default gen_random_uuid(),
  roadmap_id         uuid not null references income_roadmaps(id) on delete cascade,
  month_number       integer not null check (month_number between 1 and 12),
  planned_income     numeric(14, 2) not null default 0 check (planned_income >= 0),
  actual_income      numeric(14, 2) check (actual_income >= 0),
  actual_recorded_at timestamptz,
  actual_recorded_by uuid references profiles(id) on delete set null,
  note               text,
  updated_at         timestamptz not null default now(),
  unique (roadmap_id, month_number)
);

create index if not exists income_roadmap_months_roadmap_idx
  on income_roadmap_months (roadmap_id, month_number);

-- --------------------------------------------------------------------------
-- 3. Milestones — named checkpoints on the way up.
--    Anchored to a month of the roadmap's year (same 1..12 integer as the
--    grid). `criteria` is the "what it takes / what drives this" note that
--    the old `benefit_description` was reaching for.
-- --------------------------------------------------------------------------
create table if not exists income_roadmap_milestones (
  id            uuid primary key default gen_random_uuid(),
  roadmap_id    uuid not null references income_roadmaps(id) on delete cascade,
  title         text not null,
  target_month  integer not null check (target_month between 1 and 12),
  target_income numeric(14, 2) not null default 0 check (target_income >= 0),
  criteria      text,
  status        text not null default 'planned'
                  check (status in ('planned', 'in_progress', 'achieved', 'missed')),
  achieved_at   timestamptz,
  sort_order    integer not null default 0,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists income_roadmap_milestones_roadmap_idx
  on income_roadmap_milestones (roadmap_id, target_month, sort_order);

-- --------------------------------------------------------------------------
-- 4. Backfill from the old model.
--
--    4a. Every `staff_income_plans` row becomes a roadmap. The old table had
--        no created_at, so nothing is invented for it beyond the default.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.staff_income_plans') is not null then
    insert into income_roadmaps (staff_id, year, baseline_monthly_income, target_year_end_income, status, notes)
    select p.staff_id,
           p.year,
           coalesce(p.base_monthly_income, 0),
           coalesce(p.target_year_end_income, 0),
           'active',
           'Migrated from the previous income plan model.'
    from staff_income_plans p
    where exists (select 1 from profiles pr where pr.id = p.staff_id)
    on conflict (staff_id, year) do nothing;
  end if;
end $$;

-- --------------------------------------------------------------------------
--    4b. Seed the 12-month grid for every roadmap, then fill `planned_income`
--        by carrying the old steps forward.
--
--        An old step meant "from this month on, the income should be X", so
--        a month's planned figure is the amount of the latest step at or
--        before it, falling back to the baseline for the months before the
--        first step. That reproduces the intent of the old data as a proper
--        month grid rather than inventing a straight-line interpolation.
--        Steps whose target_month fell outside the plan's own year are not
--        carried into the grid (they still become milestones below, clamped).
-- --------------------------------------------------------------------------
insert into income_roadmap_months (roadmap_id, month_number, planned_income)
select r.id, m.n, r.baseline_monthly_income
from income_roadmaps r
cross join generate_series(1, 12) as m(n)
on conflict (roadmap_id, month_number) do nothing;

do $$
begin
  if to_regclass('public.staff_income_plans') is not null
     and to_regclass('public.income_roadmap_steps') is not null then
    update income_roadmap_months mth
    set planned_income = carried.amount
    from (
      select r.id as roadmap_id,
             g.n   as month_number,
             (
               select s.target_amount
               from income_roadmap_steps s
               join staff_income_plans p on p.id = s.plan_id
               where p.staff_id = r.staff_id
                 and p.year = r.year
                 and extract(year from s.target_month)::int = r.year
                 and extract(month from s.target_month)::int <= g.n
               order by s.target_month desc
               limit 1
             ) as amount
      from income_roadmaps r
      cross join generate_series(1, 12) as g(n)
    ) carried
    where carried.roadmap_id = mth.roadmap_id
      and carried.month_number = mth.month_number
      and carried.amount is not null
      -- Only touch rows still sitting at the seeded baseline, so re-running
      -- never overwrites a plan the CEO has since edited by hand.
      and mth.planned_income = (select baseline_monthly_income from income_roadmaps where id = mth.roadmap_id);
  end if;
end $$;

-- --------------------------------------------------------------------------
--    4c. Old steps become milestones. `benefit_description` was the only
--        free text there, so it seeds both the title (trimmed to a headline)
--        and the criteria note. A step outside its plan's year is clamped
--        into 1..12 rather than dropped.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.staff_income_plans') is not null
     and to_regclass('public.income_roadmap_steps') is not null then
    insert into income_roadmap_milestones
      (roadmap_id, title, target_month, target_income, criteria, status, achieved_at, sort_order, created_by)
    select r.id,
           left(coalesce(nullif(btrim(s.benefit_description), ''), 'Milestone'), 120),
           least(12, greatest(1, extract(month from s.target_month)::int)),
           coalesce(s.target_amount, 0),
           nullif(btrim(s.benefit_description), ''),
           case when s.status = 'achieved' then 'achieved' else 'planned' end,
           s.achieved_at,
           0,
           s.created_by
    from income_roadmap_steps s
    join staff_income_plans p on p.id = s.plan_id
    join income_roadmaps r on r.staff_id = p.staff_id and r.year = p.year
    -- Re-runnable: skip a step already carried across.
    where not exists (
      select 1 from income_roadmap_milestones existing
      where existing.roadmap_id = r.id
        and existing.target_month = least(12, greatest(1, extract(month from s.target_month)::int))
        and existing.target_income = coalesce(s.target_amount, 0)
    );
  end if;
end $$;

commit;
