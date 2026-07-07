-- Voice notes for Issues: a teacher can attach a short voice recording
-- instead of (or alongside) typing a description.
--
-- Deliberately a dedicated bucket rather than the existing `chat_media`
-- bucket the request named: chat_media's own "chat_media_read" policy
-- already grants read access to the ENTIRE bucket for any authenticated
-- user (correct for that feature — any Family Chat member or DM recipient
-- needs to play what was shared with them), which would make it impossible
-- to enforce "only the creator, assigned Manager, and CEO can play this"
-- at the storage layer. A separate bucket lets that read policy actually
-- mean something.
alter table issues add column voice_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue-voice-notes',
  'issue-voice-notes',
  false,
  15 * 1024 * 1024,
  array['audio/webm', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/wav']
)
on conflict (id) do nothing;

-- issues.voice_url stores the raw object path (not a signed URL — a signed
-- URL is a time-limited credential and shouldn't be persisted as if it were
-- permanent; the app re-signs it on read, same pattern already used for
-- lesson materials). This policy is what makes that path meaningful: it can
-- always be read by whoever uploaded it (the reporter), regardless of
-- whether the issues row has been inserted yet — the recording happens
-- before the "Create Issue" form is submitted, so there's a brief window
-- with no issues row pointing at the object at all.
create policy "issue_voice_owner_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'issue-voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Once the issue exists, its assignee and any admin (CEO/Administrative
-- Manager) can read the same object — mirrors issues_select exactly.
create policy "issue_voice_delegate_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'issue-voice-notes'
    and exists (
      select 1 from public.issues
      where voice_url = storage.objects.name
        and (public.is_admin() or created_by = auth.uid() or assigned_to = auth.uid())
    )
  );

create policy "issue_voice_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'issue-voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "issue_voice_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'issue-voice-notes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
