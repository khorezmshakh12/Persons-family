-- IT Developer is elevated to the rank directly below CEO: broad
-- day-to-day administrative authority (staff create/edit/deactivate/
-- reset-password, tasks, issues, company news, self-development
-- evaluation, chat moderation, performance tiers/bonus/penalty,
-- contracts & duties, warnings/punishments, telegram setup) by widening
-- public.is_admin() itself, the same central lever the admin_manager
-- role-rework migration used to narrow admin access down to ceo-only.
--
-- What stays CEO-exclusive regardless of this (identity/account-level
-- actions, deliberately NOT routed through is_admin()): deleting a staff
-- account, transferring the CEO role, and anything that manages a ceo or
-- admin_manager account itself (isProtectedRole in staff.ts,
-- profiles_update_admin/profiles_insert_admin below — both explicitly
-- carve out ceo/admin_manager targets for it_developer, so widening
-- is_admin() can't be used to touch a protected account via a raw client
-- call). Deleting non-identity records (a Contract, Duty, attachment,
-- performance entry, warning) is NOT in this protected set — it's plain
-- content management, elevated along with everything else.

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('ceo', 'it_developer')
  )
$$;

-- profiles insert/update -----------------------------------------------------
-- These two must NOT simply become "is_admin()" — that would let
-- it_developer insert/update a row with role='ceo' or role='admin_manager'
-- directly (RLS is the actual boundary, not the Server Action's own check
-- alone — see the staff_chats accept-gate bypass fixed earlier this
-- session). Both explicitly exclude protected-role targets for
-- it_developer, mirroring isProtectedRole()/manageRoleError() in
-- src/lib/actions/staff.ts exactly.

drop policy "profiles_insert_admin" on profiles;
create policy "profiles_insert_admin"
  on profiles for insert
  to authenticated
  with check (
    public.current_role() = 'ceo'
    or (public.current_role() = 'it_developer' and role <> 'ceo')
  );

drop policy "profiles_update_admin" on profiles;
create policy "profiles_update_admin"
  on profiles for update
  to authenticated
  using (
    public.current_role() = 'ceo'
    or (public.current_role() = 'it_developer' and role not in ('ceo', 'admin_manager'))
  )
  with check (
    public.current_role() = 'ceo'
    or (public.current_role() = 'it_developer' and role not in ('ceo', 'admin_manager'))
  );

-- staff_warnings ---------------------------------------------------------
-- Delete used to be a literal ceo-only check, separate from
-- is_ceo_or_admin_manager(); elevate it in step with deleteWarningAction
-- moving to requireAdmin() so the app-layer check and RLS stay in sync
-- (a mismatch here wouldn't be a security hole, just a silently-failing
-- delete button for it_developer).
drop policy "staff_warnings_delete_ceo" on staff_warnings;
create policy "staff_warnings_delete_admin"
  on staff_warnings for delete
  to authenticated
  using (public.is_admin());

-- staff_contracts / staff_duties / contract_requests / contract_attachments --
-- Every literal ceo-only check here (including delete) moves to is_admin()
-- (now ceo or it_developer) — none of these are identity/account-level
-- actions, so they're elevated along with everything else.

drop policy "staff_contracts_select" on staff_contracts;
create policy "staff_contracts_select"
  on staff_contracts for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

drop policy "staff_contracts_insert_ceo" on staff_contracts;
create policy "staff_contracts_insert_admin"
  on staff_contracts for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy "staff_contracts_update_ceo" on staff_contracts;
create policy "staff_contracts_update_admin"
  on staff_contracts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy "staff_contracts_delete_ceo" on staff_contracts;
create policy "staff_contracts_delete_admin"
  on staff_contracts for delete
  to authenticated
  using (public.is_admin());

drop policy "staff_duties_select" on staff_duties;
create policy "staff_duties_select"
  on staff_duties for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

drop policy "staff_duties_insert_ceo" on staff_duties;
create policy "staff_duties_insert_admin"
  on staff_duties for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy "staff_duties_update_ceo" on staff_duties;
create policy "staff_duties_update_admin"
  on staff_duties for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy "staff_duties_delete_ceo" on staff_duties;
create policy "staff_duties_delete_admin"
  on staff_duties for delete
  to authenticated
  using (public.is_admin());

drop policy "contract_requests_select" on contract_requests;
create policy "contract_requests_select"
  on contract_requests for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

drop policy "contract_requests_update_ceo" on contract_requests;
create policy "contract_requests_update_admin"
  on contract_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy "contract_attachments_select" on contract_attachments;
create policy "contract_attachments_select"
  on contract_attachments for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from staff_contracts c
      where c.id = contract_attachments.contract_id and c.staff_id = auth.uid()
    )
  );

drop policy "contract_attachments_insert_ceo" on contract_attachments;
create policy "contract_attachments_insert_admin"
  on contract_attachments for insert
  to authenticated
  with check (public.is_admin() and uploaded_by = auth.uid());

drop policy "contract_attachments_delete_ceo" on contract_attachments;
create policy "contract_attachments_delete_admin"
  on contract_attachments for delete
  to authenticated
  using (public.is_admin());

-- Storage bucket: the actual authorization boundary for contract-files is
-- the Server Action (requireCeo()/requireAdmin() + the admin/service-role
-- client, per the note in requestContractFileUploadUrlAction) since this
-- project's storage.objects INSERT/UPDATE/DELETE RLS doesn't reliably
-- apply — updated for consistency, not because it's load-bearing.
drop policy "contract_files_ceo_manage" on storage.objects;
create policy "contract_files_admin_manage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'contract-files' and public.is_admin())
  with check (bucket_id = 'contract-files' and public.is_admin());

-- Data fix -------------------------------------------------------------------
-- Pahlavon Raimboyev (+998771300555) goes back to it_developer now that the
-- role carries real authority again. protect_profile_fields_trigger checks
-- is_admin() against auth.uid(), which is null in a migration/service-role
-- context, so it must be bypassed for this one statement rather than left
-- to fail.
alter table profiles disable trigger protect_profile_fields_trigger;
update profiles set role = 'it_developer' where phone = '+998771300555';
alter table profiles enable trigger protect_profile_fields_trigger;
