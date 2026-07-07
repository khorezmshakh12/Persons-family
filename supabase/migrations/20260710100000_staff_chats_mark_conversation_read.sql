-- Read receipts: marks every unread DM from a given sender to the caller as
-- read in one statement, rather than looping N calls to the existing
-- per-message mark_staff_chat_read() when a whole conversation is opened.
create or replace function public.mark_conversation_read(other_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update staff_chats
  set is_read = true
  where receiver_id = auth.uid() and sender_id = other_user_id and is_read = false;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;
