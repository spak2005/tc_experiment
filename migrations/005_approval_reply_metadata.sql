alter table approvals
  add column agent_decision_id uuid references agent_decisions(id) on delete set null,
  add column request_message_id text,
  add column request_thread_id text,
  add column sent_message_id text,
  add column sent_thread_id text,
  add column approved_at timestamptz,
  add column rejected_at timestamptz,
  add column updated_at timestamptz not null default now();

create index approvals_pending_request_thread_idx
  on approvals(request_thread_id)
  where status = 'pending' and request_thread_id is not null;

create index approvals_pending_request_message_idx
  on approvals(request_message_id)
  where status = 'pending' and request_message_id is not null;

create index approvals_agent_decision_idx
  on approvals(agent_decision_id)
  where agent_decision_id is not null;
