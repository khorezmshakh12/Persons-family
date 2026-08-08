-- Follow-up to 20260808130000: now that 'smm_mobilgrof' is committed,
-- move every existing 'smm'/'mobilgrof' profile onto it. The app stops
-- offering the two old roles as choices anywhere from this point on.
--
-- protect_profile_fields_trigger blocks a role change unless is_admin()
-- passes, which reads auth.uid() — there's no authenticated session running
-- a migration, so that always fails here. Disabling the trigger for just
-- this one statement (same transaction, restored before commit) is the
-- standard escape hatch for an admin-run data migration like this one.
alter table profiles disable trigger protect_profile_fields_trigger;
update profiles set role = 'smm_mobilgrof' where role in ('smm', 'mobilgrof');
alter table profiles enable trigger protect_profile_fields_trigger;
