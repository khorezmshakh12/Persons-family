-- File uploads for the Contracts section. Multiple attachments per
-- contract, any file type (the signed contract itself, scans, addenda,
-- whatever the CEO needs to attach) — so this is a proper one-to-many
-- table rather than the single staff_contracts.file_url column that was
-- proposed earlier (removed in the same migration set, before it ever
-- shipped).
create table contract_attachments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references staff_contracts (id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_type text,
  uploaded_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index contract_attachments_contract_id_idx on contract_attachments (contract_id);

alter table contract_attachments enable row level security;

-- CEO sees every attachment; a staff member sees only attachments on their
-- own contract (mirrors staff_contracts_select).
create policy "contract_attachments_select"
  on contract_attachments for select
  to authenticated
  using (
    public.current_role() = 'ceo'
    or exists (
      select 1 from staff_contracts c
      where c.id = contract_attachments.contract_id and c.staff_id = auth.uid()
    )
  );

-- Uploading is CEO-only, same as the contract itself — this is the CEO
-- attaching documents to a contract they manage, not a staff self-service
-- upload.
create policy "contract_attachments_insert_ceo"
  on contract_attachments for insert
  to authenticated
  with check (public.current_role() = 'ceo' and uploaded_by = auth.uid());

create policy "contract_attachments_delete_ceo"
  on contract_attachments for delete
  to authenticated
  using (public.current_role() = 'ceo');

-- Storage bucket ------------------------------------------------------------
-- No allowed_mime_types restriction — "any kind of file" was explicit in the
-- request, unlike every other bucket in this app which scopes to a specific
-- file family (avatars: images; lesson-files: pdf/docx/images; chat_media:
-- image/video/audio). file_size_limit still applies as a blanket cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('contract-files', 'contract-files', false, 50 * 1024 * 1024)
on conflict (id) do nothing;

-- CEO has full read/write/delete on the bucket — it manages contracts
-- end-to-end (create, attach, and later replace/remove documents).
create policy "contract_files_ceo_manage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'contract-files' and public.current_role() = 'ceo')
  with check (bucket_id = 'contract-files' and public.current_role() = 'ceo');

-- A staff member can read (download/view) an attachment on their own
-- contract — same join-through-the-metadata-table pattern as
-- issue_voice_delegate_read, since object paths alone don't carry
-- ownership here.
create policy "contract_files_owner_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'contract-files'
    and exists (
      select 1 from public.contract_attachments ca
      join public.staff_contracts c on c.id = ca.contract_id
      where ca.file_url = storage.objects.name
        and c.staff_id = auth.uid()
    )
  );
