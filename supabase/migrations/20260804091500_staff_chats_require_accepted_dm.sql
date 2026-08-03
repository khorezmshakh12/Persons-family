-- The chat request/accept flow (20260804090000) was only enforced in
-- sendStaffChatAction — staff_chats_insert's own WITH CHECK still just
-- required sender_id = auth.uid(), so anyone with the anon key could call
-- supabase.from('staff_chats').insert(...) directly from the browser
-- console and message someone who never accepted (or was never even
-- asked). Reproduced directly against the live project before writing this
-- fix: a bare insert between two teachers with no dm_conversations row at
-- all succeeded. This closes that gap at the only layer that actually
-- matters — same principle as every other "re-checked server-side, not
-- just trusted from the client" comment already in this codebase.
--
-- receiver_id is null (Family Chat) stays untouched — that feature was
-- retired from the UI/actions, not the database, matching this project's
-- own convention of leaving retired things in place.
drop policy "staff_chats_insert" on staff_chats;

create policy "staff_chats_insert"
  on staff_chats for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      receiver_id is null
      or exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.role in ('ceo', 'it_developer')
      )
      or exists (
        select 1 from profiles p
        where p.id = staff_chats.receiver_id and p.role in ('ceo', 'it_developer')
      )
      or exists (
        select 1 from dm_conversations c
        where c.participant_one = least(staff_chats.sender_id, staff_chats.receiver_id)
          and c.participant_two = greatest(staff_chats.sender_id, staff_chats.receiver_id)
          and c.request_status = 'accepted'
      )
    )
  );
