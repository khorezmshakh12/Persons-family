-- KPI: a weighted scorecard per staff member. kpi_metrics defines the
-- named indicators and their weight (set once, changed rarely); kpi_entries
-- records the target/actual pair for one metric in one month — the
-- overall score is computed in the app layer as a weighted average, not
-- stored, so it never goes stale if a metric's weight is edited later.
create table kpi_metrics (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  weight_percentage int not null check (weight_percentage between 1 and 100),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table kpi_entries (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references kpi_metrics (id) on delete cascade,
  month date not null,
  target_value numeric(14, 2) not null,
  actual_value numeric(14, 2),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (metric_id, month)
);

create index kpi_metrics_staff_id_idx on kpi_metrics (staff_id);
create index kpi_entries_metric_id_idx on kpi_entries (metric_id);

alter table kpi_metrics enable row level security;
alter table kpi_entries enable row level security;

create policy "kpi_metrics_select"
  on kpi_metrics for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

create policy "kpi_metrics_insert_admin"
  on kpi_metrics for insert
  to authenticated
  with check (public.is_admin());

create policy "kpi_metrics_update_admin"
  on kpi_metrics for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "kpi_metrics_delete_admin"
  on kpi_metrics for delete
  to authenticated
  using (public.is_admin());

-- kpi_entries has no direct staff_id column, so its policies join back to
-- kpi_metrics (mirrors how staff_chats reads receiver visibility through a
-- related table elsewhere in this schema).
create policy "kpi_entries_select"
  on kpi_entries for select
  to authenticated
  using (
    public.is_admin()
    or exists (select 1 from kpi_metrics m where m.id = kpi_entries.metric_id and m.staff_id = auth.uid())
  );

create policy "kpi_entries_insert_admin"
  on kpi_entries for insert
  to authenticated
  with check (public.is_admin());

create policy "kpi_entries_update_admin"
  on kpi_entries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "kpi_entries_delete_admin"
  on kpi_entries for delete
  to authenticated
  using (public.is_admin());

-- Income roadmap: staff_income_plans is the yearly header (current base pay
-- + the year-end target); income_roadmap_steps are the CEO-authored
-- milestones between them, each required to state the business benefit
-- that justifies the raise — not just a number going up.
create table staff_income_plans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  year int not null,
  base_monthly_income numeric(14, 2) not null,
  target_year_end_income numeric(14, 2) not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (staff_id, year)
);

create table income_roadmap_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references staff_income_plans (id) on delete cascade,
  target_amount numeric(14, 2) not null,
  target_month date not null,
  benefit_description text not null,
  status text not null default 'pending' check (status in ('pending', 'achieved')),
  achieved_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index staff_income_plans_staff_id_idx on staff_income_plans (staff_id);
create index income_roadmap_steps_plan_id_idx on income_roadmap_steps (plan_id);

alter table staff_income_plans enable row level security;
alter table income_roadmap_steps enable row level security;

create policy "staff_income_plans_select"
  on staff_income_plans for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

create policy "staff_income_plans_insert_admin"
  on staff_income_plans for insert
  to authenticated
  with check (public.is_admin());

create policy "staff_income_plans_update_admin"
  on staff_income_plans for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "staff_income_plans_delete_admin"
  on staff_income_plans for delete
  to authenticated
  using (public.is_admin());

create policy "income_roadmap_steps_select"
  on income_roadmap_steps for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from staff_income_plans p
      where p.id = income_roadmap_steps.plan_id and p.staff_id = auth.uid()
    )
  );

create policy "income_roadmap_steps_insert_admin"
  on income_roadmap_steps for insert
  to authenticated
  with check (public.is_admin());

create policy "income_roadmap_steps_update_admin"
  on income_roadmap_steps for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "income_roadmap_steps_delete_admin"
  on income_roadmap_steps for delete
  to authenticated
  using (public.is_admin());
