-- Broadcast chat_messages inserts/deletes to subscribed clients.
alter publication supabase_realtime add table chat_messages;
