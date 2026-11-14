-- ==========================================================================
-- Owner, 2026-11-14: Sitora ustoz becomes Head teacher (Bosh o'qituvchi).
-- head_teacher already carries academic.viewAll: every group's lesson plans
-- visible + review/comment. Primary role -> head_teacher; her old teaching
-- role is kept as an extra position (profile_roles) so she can still switch
-- to it in the header and edit her own groups' plans.
-- Only runs when exactly one active staff member is named Sitora; otherwise
-- changes nothing and says so (then assign on the "Lavozimlar" page).
-- ==========================================================================

begin;

do $$
declare
  n int;
  uid uuid;
  old_role staff_role;
begin
  select count(*) into n from profiles
  where is_active and first_name ilike 'sitora%';

  if n <> 1 then
    raise notice 'sitora_head_teacher: % active Sitora profiles found, nothing changed', n;
    return;
  end if;

  select id, role into uid, old_role from profiles
  where is_active and first_name ilike 'sitora%';

  if old_role = 'head_teacher' then
    raise notice 'sitora_head_teacher: already head_teacher';
    return;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'protect_profile_fields_trigger') then
    execute 'alter table profiles disable trigger protect_profile_fields_trigger';
  end if;

  update profiles set role = 'head_teacher' where id = uid;

  if exists (select 1 from pg_trigger where tgname = 'protect_profile_fields_trigger') then
    execute 'alter table profiles enable trigger protect_profile_fields_trigger';
  end if;

  delete from profile_roles where user_id = uid and role = 'head_teacher';
  insert into profile_roles (user_id, role) values (uid, old_role) on conflict do nothing;

  raise notice 'sitora_head_teacher: % -> head_teacher (kept % as extra position)', uid, old_role;
end $$;

commit;
