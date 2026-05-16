create table agent_activity_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  agent_decision_id uuid references agent_decisions(id) on delete set null,
  source_type text not null,
  event_type text not null,
  title text not null,
  summary text not null default '',
  status text not null,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index agent_activity_events_transaction_occurred_idx
  on agent_activity_events(transaction_id, occurred_at, id);

create index agent_activity_events_team_occurred_idx
  on agent_activity_events(team_id, occurred_at desc, id);

create index agent_activity_events_decision_idx
  on agent_activity_events(agent_decision_id)
  where agent_decision_id is not null;
