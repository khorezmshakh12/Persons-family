-- Follow-up to 20260820120000: now that 'mmd' is committed, move every
-- existing 'smm_mobilgrof' profile onto it. The app stops offering
-- smm_mobilgrof as a choice anywhere from this point on.
--
-- protect_profile_fields_trigger blocks a role change unless is_admin()
-- passes, which reads auth.uid() — there's no authenticated session running
-- a migration, so that always fails here. Disabling the trigger for just
-- this one statement (same transaction, restored before commit) is the
-- standard escape hatch for an admin-run data migration like this one
-- (same as 20260808130100_merge_smm_mobilgrof_role_data.sql).
alter table profiles disable trigger protect_profile_fields_trigger;
update profiles set role = 'mmd' where role = 'smm_mobilgrof';
-- Fayzulloh Qobulov moves onto the new media-department role explicitly,
-- regardless of whatever role he held before this migration.
update profiles set role = 'mmd' where first_name = 'Fayzulloh' and last_name = 'Qobulov';
alter table profiles enable trigger protect_profile_fields_trigger;
