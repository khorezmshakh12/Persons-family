-- Allow every staff member to edit their own display name (first/last name)
-- from the new self-service "My Profile" section on Settings. Previously
-- protect_profile_fields() blocked first_name/last_name on any self-update,
-- bundled in with genuinely sensitive fields (role, phone, date_of_birth,
-- is_active) that must stay admin-only. Those four stay locked down here —
-- only first_name/last_name move to self-editable. avatar_url was never in
-- this list, so self-service avatar uploads already worked before this.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
      or new.phone is distinct from old.phone
      or new.date_of_birth is distinct from old.date_of_birth
      or new.is_active is distinct from old.is_active
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  return new;
end;
$$;
