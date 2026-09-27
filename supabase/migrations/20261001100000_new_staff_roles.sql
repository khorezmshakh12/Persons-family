-- Nine new staff positions (owner, 2026-09-27). Two already existed
-- (admin_manager, head_teacher); the other seven are added to the enum here.
-- Additive only, like every earlier staff_role change: nothing in this file
-- references the new values (a new enum value can't be used in the
-- transaction that adds it). Access per role lives in src/lib/permissions.ts.
begin;

alter type staff_role add value if not exists 'coo';
alter type staff_role add value if not exists 'commercial_director';
alter type staff_role add value if not exists 'academic_director';
alter type staff_role add value if not exists 'financist';
alter type staff_role add value if not exists 'operations_manager';
alter type staff_role add value if not exists 'sales_manager';
alter type staff_role add value if not exists 'event_manager';

commit;
