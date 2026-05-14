alter table documents
  add column owner_role text,
  add column due_date date,
  add column metadata jsonb not null default '{}';

alter table milestones
  add column metadata jsonb not null default '{}';

alter table tasks
  add column follow_up_due_date date,
  add column metadata jsonb not null default '{}';

alter table blockers
  add column task_id uuid references tasks(id) on delete set null;

create index documents_transaction_owner_due_idx
  on documents(transaction_id, owner_role, due_date)
  where status not in ('approved', 'not_applicable');

create index tasks_follow_up_due_idx
  on tasks(follow_up_due_date)
  where status = 'waiting_response' and follow_up_due_date is not null;

create index blockers_task_open_idx
  on blockers(task_id)
  where resolved_at is null and task_id is not null;
