-- Telegram-style replies + emoji reactions on the /chat social hub
-- (staff_chats). Reactions are toggled through a security-definer RPC
-- rather than a blanket UPDATE RLS grant, so a participant can only ever
-- flip their own entry in the JSONB map — never rewrite someone else's
-- reaction, the message text, or any other column on a row they can see.

alter table staff_chats add column reply_to_id uuid references staff_chats (id) on delete set null;
alter table staff_chats add column reactions jsonb not null default '{}'::jsonb;

create index staff_chats_reply_to_idx on staff_chats (reply_to_id) where reply_to_id is not null;

-- reactions shape: { "👍": ["user-uuid", ...], "❤️": ["user-uuid", ...] }.
-- Adds the caller to the emoji's array if absent, removes them if present,
-- and drops the emoji key entirely once its array empties out.
create or replace function public.toggle_staff_chat_reaction(message_id uuid, emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reactions jsonb;
  visible boolean;
  uid_json jsonb := to_jsonb(auth.uid()::text);
  emoji_users jsonb;
  updated jsonb;
begin
  select reactions, (receiver_id is null or sender_id = auth.uid() or receiver_id = auth.uid())
    into current_reactions, visible
    from staff_chats
    where id = message_id;

  if current_reactions is null or not coalesce(visible, false) then
    raise exception 'Message not found or not accessible';
  end if;

  emoji_users := coalesce(current_reactions -> emoji, '[]'::jsonb);

  if emoji_users @> uid_json then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into emoji_users
    from jsonb_array_elements(emoji_users) x
    where x <> uid_json;
  else
    emoji_users := emoji_users || jsonb_build_array(uid_json);
  end if;

  if jsonb_array_length(emoji_users) = 0 then
    updated := current_reactions - emoji;
  else
    updated := jsonb_set(current_reactions, array[emoji], emoji_users);
  end if;

  update staff_chats set reactions = updated where id = message_id;
  return updated;
end;
$$;

grant execute on function public.toggle_staff_chat_reaction(uuid, text) to authenticated;
