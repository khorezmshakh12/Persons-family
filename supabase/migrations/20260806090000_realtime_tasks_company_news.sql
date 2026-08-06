-- The sidebar's task/company-news "new" dots and the notification bell's
-- task section are meant to update live via Supabase Realtime, but
-- `tasks`, `company_news`, and `company_news_reads` were never added to the
-- `supabase_realtime` publication — the exact same gap `issues` had before
-- 20260712090000_notification_bell_fixes.sql fixed it there. Without this,
-- a postgres_changes subscription on these tables silently receives
-- nothing, so a newly assigned task or a new company news post only ever
-- showed up after the next navigation (when the layout recomputes its
-- server-side snapshot) instead of the instant it happened.
alter table tasks replica identity full;
alter publication supabase_realtime add table tasks;

alter table company_news replica identity full;
alter publication supabase_realtime add table company_news;

alter table company_news_reads replica identity full;
alter publication supabase_realtime add table company_news_reads;
