-- Chat messages can be edited by their author (owner, 2026-10-06).
-- edited_at drives the "tahrirlangan" label; null = never edited.
begin;
alter table staff_chats add column if not exists edited_at timestamptz;
alter table staff_chat_messages add column if not exists edited_at timestamptz;
commit;
