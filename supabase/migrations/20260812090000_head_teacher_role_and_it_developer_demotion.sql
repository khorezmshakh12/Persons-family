-- New role: Head Teacher gets CEO-equivalent lesson-plan viewing +
-- commenting rights specifically (not general admin power), via its own
-- explicit `current_role()='head_teacher'` clause rather than being folded
-- into public.is_admin() (which also grants unrelated admin powers —
-- staff CRUD, telegram, etc.).
alter type staff_role add value if not exists 'head_teacher';
