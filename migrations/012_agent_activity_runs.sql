create table agent_activity_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  workflow_type text not null,
  title text not null,
  summary text not null default '',
  status text not null,
  metadata jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent_activity_events
  add column activity_run_id uuid references agent_activity_runs(id) on delete set null;

create index agent_activity_runs_user_started_idx
  on agent_activity_runs(user_id, started_at desc, id);

create index agent_activity_runs_transaction_started_idx
  on agent_activity_runs(transaction_id, started_at desc, id)
  where transaction_id is not null;

create index agent_activity_events_run_occurred_idx
  on agent_activity_events(activity_run_id, occurred_at, id)
  where activity_run_id is not null;
