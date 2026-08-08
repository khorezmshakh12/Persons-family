-- New staff role for trainees (our own students or outside candidates
-- brought on to gain experience before becoming full staff). No existing
-- rows need migrating — this is a brand-new role nobody has yet, so unlike
-- the smm/mobilgrof merge this can all land in one migration (the "can't
-- use a new enum value in the same transaction it was added in" restriction
-- only bites when something in this same file tries to INSERT/UPDATE a row
-- to that value, which nothing here does).
alter type staff_role add value if not exists 'internship';

-- A simple three-tier level (unlike teacher_level's nine), set directly by
-- the CEO — not tied to the Self-Development monthly review flow the way
-- teacher_level is, since an intern has no self-development history yet.
create type internship_level as enum ('C', 'B', 'A');

alter table profiles
  add column internship_level internship_level not null default 'C';

-- Extend the existing profile-field protection to cover the new column —
-- same admin-only rule as teacher_level and everything else in this list.
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
      or new.first_name is distinct from old.first_name
      or new.last_name is distinct from old.last_name
      or new.date_of_birth is distinct from old.date_of_birth
      or new.is_active is distinct from old.is_active
      or new.teacher_level is distinct from old.teacher_level
      or new.level_updated_at is distinct from old.level_updated_at
      or new.internship_level is distinct from old.internship_level
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  return new;
end;
$$;
