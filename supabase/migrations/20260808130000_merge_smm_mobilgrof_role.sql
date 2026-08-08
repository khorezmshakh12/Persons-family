-- Merging 'smm' and 'mobilgrof' into a single role — a new enum value must
-- land in its own committed transaction before any DML can reference it
-- (Postgres disallows using a brand-new enum label in the same transaction
-- that added it), so the actual data migration is a separate follow-up
-- file. The old 'smm'/'mobilgrof' labels are left in the type permanently
-- unused rather than removed — this project's own precedent (see
-- 20260709120000_new_roles_and_issue_delegation.sql) is additive-only for
-- this enum, since Postgres can't drop an enum value at all without a full
-- type recreation.
alter type staff_role add value if not exists 'smm_mobilgrof';
