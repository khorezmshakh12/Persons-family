-- Chat "status" (Important / normal), scoped to the conversation as a whole
-- rather than to individual messages.
--
-- staff_chats (20260708090000) is message-per-row with no conversation
-- entity — a DM "conversation" is just the set of rows sharing an unordered
-- {sender_id, receiver_id} pair. Rather than retrofitting a conversation_id
-- onto every existing message row (a backfill across live chat history for
-- a feature that's purely "is this DM starred"), this adds a small
-- side-table keyed by the participant pair. The general chat list filters
-- by joining on that pair; starting a new DM upserts a row here at the same
-- time the first message is sent.
--
-- participant_one < participant_two is a canonical ordering so each pair of
-- staff members maps to exactly one row regardless of who started the chat.
create type dm_status as enum ('normal', 'important');

create table dm_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one uuid not null references profiles (id) on delete cascade,
  participant_two uuid not null references profiles (id) on delete cascade,
  status dm_status not null default 'normal',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check (participant_one <> participant_two),
  check (participant_one < participant_two)
);

create unique index dm_conversations_pair_idx on dm_conversations (participant_one, participant_two);

alter table dm_conversations enable row level security;

create policy "dm_conversations_select"
  on dm_conversations for select
  to authenticated
  using (participant_one = auth.uid() or participant_two = auth.uid());

-- CEO/IT Developer moderate which conversations surface on the general chat
-- list, so they need to see the conversation roster (participants + status)
-- to act on it — even though they still can't read the DM content itself
-- (staff_chats' own RLS deliberately keeps that participant-only, unchanged
-- by this migration).
create policy "dm_conversations_select_moderators"
  on dm_conversations for select
  to authenticated
  using (public.current_role() in ('ceo', 'it_developer'));

create policy "dm_conversations_insert"
  on dm_conversations for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (participant_one = auth.uid() or participant_two = auth.uid())
  );

-- Marking Important is a moderation action, not something either
-- participant does for themselves — restricted to CEO and IT Developer
-- only (confirmed with product owner; notably NOT Administrative Manager,
-- unlike most of this migration set's other CEO-adjacent grants).
create policy "dm_conversations_update_important_flag"
  on dm_conversations for update
  to authenticated
  using (public.current_role() in ('ceo', 'it_developer'))
  with check (public.current_role() in ('ceo', 'it_developer'));
