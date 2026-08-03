-- Contracts & Duties.
--
-- Duties are intentionally NOT nested under a required contract: the
-- product spec calls for a staff member's Duties to stay visible on their
-- Profile page even while the whole Contracts & Duties board is hidden
-- behind a "Coming Soon" placeholder (contract generation by the CEO isn't
-- built yet). contract_id is nullable so a duty can exist and be shown on
-- the Profile page before any contract has ever been created for that
-- person; once contracts exist it can optionally be tied to one.
create type contract_status as enum ('active', 'frozen', 'ended');
create type contract_request_type as enum ('freeze', 'extend');
create type contract_request_status as enum ('pending', 'approved', 'rejected');

create table staff_contracts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date,
  status contract_status not null default 'active',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_contracts_staff_id_idx on staff_contracts (staff_id);

alter table staff_contracts enable row level security;

create policy "staff_contracts_select"
  on staff_contracts for select
  to authenticated
  using (public.current_role() = 'ceo' or staff_id = auth.uid());

create policy "staff_contracts_insert_ceo"
  on staff_contracts for insert
  to authenticated
  with check (public.current_role() = 'ceo' and created_by = auth.uid());

create policy "staff_contracts_update_ceo"
  on staff_contracts for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

create policy "staff_contracts_delete_ceo"
  on staff_contracts for delete
  to authenticated
  using (public.current_role() = 'ceo');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger staff_contracts_touch_updated_at
  before update on staff_contracts
  for each row execute function public.touch_updated_at();

-- Duties -----------------------------------------------------------------
create table staff_duties (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  contract_id uuid references staff_contracts (id) on delete set null,
  title text not null,
  description text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index staff_duties_staff_id_idx on staff_duties (staff_id);
create index staff_duties_contract_id_idx on staff_duties (contract_id);

alter table staff_duties enable row level security;

create policy "staff_duties_select"
  on staff_duties for select
  to authenticated
  using (public.current_role() = 'ceo' or staff_id = auth.uid());

create policy "staff_duties_insert_ceo"
  on staff_duties for insert
  to authenticated
  with check (public.current_role() = 'ceo' and created_by = auth.uid());

create policy "staff_duties_update_ceo"
  on staff_duties for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

create policy "staff_duties_delete_ceo"
  on staff_duties for delete
  to authenticated
  using (public.current_role() = 'ceo');

-- Freeze/extend requests ---------------------------------------------------
-- One-shot: a staff member can only create a request (for their own active
-- contract); only the CEO can move it to approved/rejected. There is no
-- staff UPDATE policy at all, so a submitted request is immutable from the
-- requester's side without needing a protect-fields trigger.
create table contract_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references staff_contracts (id) on delete cascade,
  staff_id uuid not null references profiles (id) on delete cascade,
  request_type contract_request_type not null,
  reason text,
  status contract_request_status not null default 'pending',
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index contract_requests_contract_id_idx on contract_requests (contract_id);
create index contract_requests_staff_id_idx on contract_requests (staff_id);

alter table contract_requests enable row level security;

create policy "contract_requests_select"
  on contract_requests for select
  to authenticated
  using (public.current_role() = 'ceo' or staff_id = auth.uid());

create policy "contract_requests_insert_self"
  on contract_requests for insert
  to authenticated
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from staff_contracts c
      where c.id = contract_requests.contract_id
        and c.staff_id = auth.uid()
        and c.status = 'active'
    )
  );

create policy "contract_requests_update_ceo"
  on contract_requests for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');
