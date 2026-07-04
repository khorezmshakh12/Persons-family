-- One-time diagnostic check (no schema changes) confirming chat_messages was
-- correctly added to the supabase_realtime publication after Step 8's
-- realtime debugging. Kept as a migration so local/remote history stay in sync.
do $$
declare
  is_member boolean;
  replica_identity text;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) into is_member;

  select relreplident into replica_identity
  from pg_class where relname = 'chat_messages';

  raise notice 'chat_messages in supabase_realtime publication: %', is_member;
  raise notice 'chat_messages replica identity: %', replica_identity;
end $$;
