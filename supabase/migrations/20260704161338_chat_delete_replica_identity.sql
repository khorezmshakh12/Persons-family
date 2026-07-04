-- With the default replica identity, a DELETE's replication payload only
-- carries the primary key, which Realtime doesn't consider enough to safely
-- authorize a postgres_changes DELETE broadcast against RLS — it drops the
-- event silently rather than deliver it. FULL includes the whole old row.
alter table chat_messages replica identity full;
