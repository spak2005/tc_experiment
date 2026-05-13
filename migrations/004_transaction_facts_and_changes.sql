create table transaction_facts (
  transaction_id uuid not null references transactions(id) on delete cascade,
  key text not null,
  value jsonb not null,
  confidence numeric(4, 3) not null default 0,
  source_type text not null,
  source_reference text,
  needs_confirmation boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (transaction_id, key)
);

create table transaction_change_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  agent_decision_id uuid references agent_decisions(id) on delete set null,
  change_type text not null,
  target_type text not null,
  target_id text,
  field_key text not null,
  previous_value jsonb,
  new_value jsonb,
  source_type text not null,
  source_reference text,
  confidence numeric(4, 3) not null default 0,
  approval_status text not null default 'applied',
  created_at timestamptz not null default now()
);

create index transaction_facts_updated_idx
  on transaction_facts(transaction_id, updated_at desc);

create index transaction_change_events_transaction_created_idx
  on transaction_change_events(transaction_id, created_at desc);

create index transaction_change_events_decision_idx
  on transaction_change_events(agent_decision_id)
  where agent_decision_id is not null;
