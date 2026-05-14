alter table approvals
  add column task_id uuid references tasks(id) on delete set null;

create index approvals_task_pending_idx
  on approvals(task_id)
  where status = 'pending' and task_id is not null;
