create table transaction_memory (
  transaction_id uuid primary key references transactions(id) on delete cascade,
  summary text not null default '',
  open_questions jsonb not null default '[]',
  known_context jsonb not null default '{}',
  last_inbound_at timestamptz,
  updated_at timestamptz not null default now()
);

create table agent_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  inbound_message_id text,
  inbound_thread_id text,
  intent text not null,
  action text not null,
  confidence numeric(4, 3) not null default 0,
  match_confidence numeric(4, 3),
  requires_approval boolean not null default false,
  policy_result text not null default 'not_evaluated',
  rationale text not null default '',
  context_summary jsonb not null default '{}',
  tool_plan jsonb not null default '[]',
  tool_results jsonb not null default '[]',
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create index agent_decisions_user_created_idx on agent_decisions(user_id, created_at desc);
create index agent_decisions_transaction_created_idx on agent_decisions(transaction_id, created_at desc);
create index transaction_memory_updated_idx on transaction_memory(updated_at desc);
