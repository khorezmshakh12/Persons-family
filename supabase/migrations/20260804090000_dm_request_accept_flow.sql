-- Chat request/accept flow. Two staff members who are both regular staff
-- (not CEO/IT Developer) can't just start messaging each other — the first
-- contact creates a pending request that the recipient must accept before
-- either side can actually send messages. CEO and IT Developer are exempt
-- entirely: a conversation involving either of them is accepted instantly,
-- no request step, in both directions (matches "always reachable").
--
-- All of this is expressed as two security-definer RPCs rather than plain
-- table RLS, because the "is either participant CEO/IT Developer" check
-- needs a role lookup that's awkward to express safely as a reusable
-- INSERT/UPDATE policy, and because start_dm_conversation needs
-- create-or-upgrade-to-accepted semantics in one atomic step.
create type dm_request_status as enum ('pending', 'accepted');

alter table dm_conversations add column request_status dm_request_status not null default 'accepted';

-- Backfill: pairs who already exchanged DM messages before dm_conversations
-- existed (this table only started getting rows once the first version of
-- the chat hub started upserting on send) have real history but no row at
-- all — without this, the new gate below would treat an ongoing, months-old
-- conversation as a fresh, never-contacted stranger. created_by is
-- attribution-only here — reusing the least() group-by key (not min(),
-- which has no built-in aggregate overload for uuid) just picks one of the
-- two real participants deterministically, since neither side needs to
-- "accept" a conversation that already happened.
insert into dm_conversations (participant_one, participant_two, created_by, request_status)
select
  least(sender_id, receiver_id),
  greatest(sender_id, receiver_id),
  least(sender_id, receiver_id),
  'accepted'
from staff_chats
where receiver_id is not null
group by least(sender_id, receiver_id), greatest(sender_id, receiver_id)
on conflict (participant_one, participant_two) do nothing;

-- Resolves (or creates) the conversation for the caller and other_user_id,
-- returning its id and request_status. Bypass-eligible pairs (either side
-- is ceo/it_developer) are created — or upgraded, if a stale pending row
-- somehow exists — as 'accepted' directly. Everyone else gets 'pending' on
-- first contact and has to wait for respond_to_dm_request.
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

  bypass := my_role in ('ceo', 'it_developer') or other_role in ('ceo', 'it_developer');

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

grant execute on function public.start_dm_conversation(uuid) to authenticated;

-- The recipient (never the requester) accepts or declines. Declining
-- deletes the row outright rather than tracking a 'declined' status — the
-- requester just sees the contact as never-contacted again, and can retry
-- later without a separate "un-decline" path to build.
create or replace function public.respond_to_dm_request(target_conversation_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  convo record;
begin
  select * into convo from dm_conversations where dm_conversations.id = target_conversation_id;
  if convo.id is null then
    raise exception 'Conversation not found';
  end if;
  if convo.created_by = auth.uid() then
    raise exception 'Cannot respond to your own request';
  end if;
  if convo.participant_one <> auth.uid() and convo.participant_two <> auth.uid() then
    raise exception 'Not a participant in this conversation';
  end if;
  if convo.request_status <> 'pending' then
    raise exception 'This request has already been resolved';
  end if;

  if accept then
    update dm_conversations set request_status = 'accepted' where dm_conversations.id = target_conversation_id;
  else
    delete from dm_conversations where dm_conversations.id = target_conversation_id;
  end if;
end;
$$;

grant execute on function public.respond_to_dm_request(uuid, boolean) to authenticated;
