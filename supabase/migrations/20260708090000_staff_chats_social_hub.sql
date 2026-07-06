-- New social-hub-style chat at /chat: a company-wide "Family Chat"
-- (receiver_id is null) plus private 1:1 DMs between any two staff members,
-- with media (image/video/voice) attachments.
--
-- The existing chat_messages table (and its pin/admin-delete/chat_enabled
-- moderation) is left in place untouched — same precedent as every other
-- retired feature in this project — but /chat's UI now points at this new
-- table instead. Family Chat carries forward the same admin moderation
-- (pin, delete-any, and the existing app_settings.chat_enabled toggle) so
-- that capability isn't silently lost in the transition. DMs are private
-- between their two participants only — no admin/CEO visibility was
-- requested for those, and adding it unprompted would be a real privacy
-- overreach, so it deliberately isn't included.

create type chat_media_type as enum ('image', 'video', 'voice', 'none');

create table staff_chats (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles (id) on delete cascade,
  -- null = Family Chat (global); otherwise a private 1:1 DM with this user.
  receiver_id uuid references profiles (id) on delete cascade,
  message_text text,
  media_url text,
  media_type chat_media_type not null default 'none',
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  check (message_text is not null or media_url is not null),
  check (receiver_id is null or receiver_id <> sender_id)
);

create index staff_chats_family_idx on staff_chats (created_at) where receiver_id is null;
create index staff_chats_dm_idx on staff_chats (sender_id, receiver_id, created_at);

alter table staff_chats enable row level security;

create policy "staff_chats_select"
  on staff_chats for select
  to authenticated
  using (receiver_id is null or sender_id = auth.uid() or receiver_id = auth.uid());

create policy "staff_chats_insert"
  on staff_chats for insert
  to authenticated
  with check (sender_id = auth.uid());

create policy "staff_chats_delete_own"
  on staff_chats for delete
  to authenticated
  using (sender_id = auth.uid());

-- Family Chat moderation only (mirrors chat_messages' admin policies) —
-- these grants have no effect on DM rows since is_admin() alone can't
-- satisfy privacy for someone else's private conversation; scoped
-- explicitly to receiver_id is null for clarity even though DMs were never
-- intended to be covered.
create policy "staff_chats_delete_admin_family"
  on staff_chats for delete
  to authenticated
  using (receiver_id is null and public.is_admin());

create policy "staff_chats_update_admin_family"
  on staff_chats for update
  to authenticated
  using (receiver_id is null and public.is_admin())
  with check (receiver_id is null and public.is_admin());

alter table staff_chats replica identity full;
alter publication supabase_realtime add table staff_chats;

-- chat_media storage bucket ---------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat_media', 'chat_media', false, 50 * 1024 * 1024, array['image/*', 'video/*', 'audio/*'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read chat media (a DM recipient or any Family Chat member
-- needs to view/play what was shared with them) — uploads are scoped to
-- the uploader's own folder for attribution, matching every other bucket's
-- convention in this app.
create policy "chat_media_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat_media');

create policy "chat_media_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat_media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "chat_media_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat_media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
