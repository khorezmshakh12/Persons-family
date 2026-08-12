-- IT Developer becomes a plain regular employee — every elevated capability
-- granted by 20260804093000_it_developer_elevated_rank.sql and its
-- follow-ups is reverted. This is the single largest lever: redefining
-- is_admin() back to ceo-only automatically narrows every policy that
-- composes it (issues_select, staff_warnings_delete_admin,
-- staff_contracts_*, staff_duties_*, contract_requests_*,
-- contract_attachments_*, the contract-files storage policy, and
-- is_ceo_or_admin_manager()) without touching each one individually.
create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ceo'
  )
$$;

-- The following don't route through is_admin() — each has its own literal
-- `current_role() = 'it_developer'` branch that must be dropped explicitly.

drop policy "profiles_insert_admin" on profiles;
create policy "profiles_insert_admin"
  on profiles for insert
  to authenticated
  with check (public.current_role() = 'ceo');

drop policy "profiles_update_admin" on profiles;
create policy "profiles_update_admin"
  on profiles for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

drop policy "profiles_delete_admin" on profiles;
create policy "profiles_delete_admin"
  on profiles for delete
  to authenticated
  using (id <> auth.uid() and public.current_role() = 'ceo');

drop policy "dm_conversations_select_moderators" on dm_conversations;
create policy "dm_conversations_select_moderators"
  on dm_conversations for select
  to authenticated
  using (public.current_role() = 'ceo');

drop policy "dm_conversations_update_important_flag" on dm_conversations;
create policy "dm_conversations_update_important_flag"
  on dm_conversations for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

-- start_dm_conversation(): only a conversation involving the CEO now
-- auto-accepts; everyone else (including IT Developer) goes through the
-- normal request/accept flow.
create or replace function public.start_dm_conversation(other_user_id uuid)
returns table (id uuid, request_status dm_request_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role staff_role;
  other_role staff_role;
  p1 uuid;
  p2 uuid;
  bypass boolean;
  existing_id uuid;
  existing_status dm_request_status;
begin
  if me = other_user_id then
    raise exception 'Cannot start a conversation with yourself';
  end if;

  select role into my_role from profiles where profiles.id = me;
  select role into other_role from profiles where profiles.id = other_user_id;
  if other_role is null then
    raise exception 'Recipient not found';
  end if;

  bypass := my_role = 'ceo' or other_role = 'ceo';

  if me < other_user_id then
    p1 := me;
    p2 := other_user_id;
  else
    p1 := other_user_id;
    p2 := me;
  end if;

  select dm_conversations.id, dm_conversations.request_status
    into existing_id, existing_status
    from dm_conversations
    where dm_conversations.participant_one = p1 and dm_conversations.participant_two = p2;

  if existing_id is not null then
    if bypass and existing_status <> 'accepted' then
      update dm_conversations set request_status = 'accepted' where dm_conversations.id = existing_id;
      existing_status := 'accepted';
    end if;
    return query select existing_id, existing_status;
    return;
  end if;

  insert into dm_conversations (participant_one, participant_two, created_by, request_status)
  values (p1, p2, me, case when bypass then 'accepted'::dm_request_status else 'pending'::dm_request_status end)
  returning dm_conversations.id, dm_conversations.request_status into existing_id, existing_status;

  return query select existing_id, existing_status;
end;
$$;

drop policy "staff_chats_insert" on staff_chats;
create policy "staff_chats_insert"
  on staff_chats for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      receiver_id is null
      or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ceo')
      or exists (select 1 from profiles p where p.id = staff_chats.receiver_id and p.role = 'ceo')
      or exists (
        select 1 from dm_conversations c
        where c.participant_one = least(staff_chats.sender_id, staff_chats.receiver_id)
          and c.participant_two = greatest(staff_chats.sender_id, staff_chats.receiver_id)
          and c.request_status = 'accepted'
      )
    )
  );

-- Bonus fix (found during this pass, not an IT-Developer issue): roadmap_goals'
-- only policy referenced the shared is_admin() rather than an explicit role
-- list, so it silently inherited whatever is_admin() happened to mean at
-- any given time. It was written when is_admin() meant ceo+admin_manager;
-- today (pre-this-migration) it meant ceo+it_developer — meaning
-- admin_manager (who the app layer/nav says should have Roadmap access) has
-- been silently blocked by RLS, while it_developer (who shouldn't) could
-- read/write roadmap_goals directly via the REST API, bypassing
-- requireCeoOrAdminManager() entirely. Decoupled from is_admin() for good.
drop policy "roadmap_goals_all_admin" on roadmap_goals;
create policy "roadmap_goals_all_admin"
  on roadmap_goals for all
  to authenticated
  using (public.current_role() in ('ceo', 'admin_manager'))
  with check (public.current_role() in ('ceo', 'admin_manager'));
