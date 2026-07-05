-- Fix: staff_chat_messages RLS only checked role (teacher/assistant), not
-- group ownership — unlike every other table in the prior migration. That
-- let any teacher query staff_chat_messages directly (bypassing the UI's
-- conversation_id filter) and read another teacher's private group chat
-- with their assistant. Assistants keep broad visibility (established
-- precedent for this feature); the global room stays open to every
-- teacher/assistant; a teacher's own group conversations now require actual
-- ownership, matching is_group_owner() usage everywhere else.

drop policy "staff_chat_messages_select" on staff_chat_messages;
drop policy "staff_chat_messages_insert" on staff_chat_messages;

create policy "staff_chat_messages_select"
  on staff_chat_messages for select
  to authenticated
  using (
    public.current_role() = 'assistant'
    or (
      public.current_role() = 'teacher'
      and (
        conversation_id = '00000000-0000-0000-0000-000000000001'::uuid
        or public.is_group_owner(conversation_id)
      )
    )
  );

create policy "staff_chat_messages_insert"
  on staff_chat_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.current_role() = 'assistant'
      or (
        public.current_role() = 'teacher'
        and (
          conversation_id = '00000000-0000-0000-0000-000000000001'::uuid
          or public.is_group_owner(conversation_id)
        )
      )
    )
  );
