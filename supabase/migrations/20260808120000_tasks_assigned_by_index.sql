-- tasks_select's RLS policy checks `assigned_by = auth.uid() or assigned_to
-- = auth.uid()` on every query against this table, and the app's own tasks
-- page filters on the same pair — but only assigned_to ever got an index
-- (tasks_assigned_to_idx). assigned_by has been doing a full table scan on
-- every single tasks query since the table was created.
create index tasks_assigned_by_idx on tasks (assigned_by);
