create table agent_wakeups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  action_type text not null,
  reason text not null,
  status text not null default 'pending',
  dedupe_key text not null,
  wake_at timestamptz not null,
  payload jsonb not null default '{}',
  preconditions jsonb not null default '{}',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_wakeups_status_check check (
    status in ('pending', 'running', 'completed', 'cancelled', 'failed', 'skipped')
  ),
  constraint agent_wakeups_action_type_check check (
    action_type in ('transaction_dispatch', 'transaction_heartbeat', 'task_follow_up')
  )
);

create unique index agent_wakeups_pending_dedupe_idx
  on agent_wakeups(dedupe_key)
  where status in ('pending', 'running');

create index agent_wakeups_due_idx
  on agent_wakeups(wake_at, created_at)
  where status = 'pending';

create index agent_wakeups_transaction_idx
  on agent_wakeups(transaction_id, status, wake_at);

create index agent_wakeups_task_idx
  on agent_wakeups(task_id, status, wake_at)
  where task_id is not null;
