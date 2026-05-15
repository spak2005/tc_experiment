alter table transactions
  add column intake_source_key text;

create unique index transactions_intake_source_key_idx
  on transactions(intake_source_key)
  where intake_source_key is not null;

alter table documents
  add column source_attachment_key text;

create unique index documents_source_attachment_key_idx
  on documents(source_attachment_key)
  where source_attachment_key is not null;

alter table agent_decisions
  add column idempotency_key text;

create unique index agent_decisions_idempotency_key_idx
  on agent_decisions(idempotency_key)
  where idempotency_key is not null;

alter table approvals
  add column idempotency_key text;

create unique index approvals_idempotency_key_idx
  on approvals(idempotency_key)
  where idempotency_key is not null;

create unique index blockers_open_deadline_unique_idx
  on blockers(deadline_id)
  where resolved_at is null and deadline_id is not null;

create unique index blockers_open_task_unique_idx
  on blockers(task_id)
  where resolved_at is null and task_id is not null;

create table outbound_email_actions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  status text not null default 'pending',
  send_kind text not null,
  inbox_id text not null,
  message_id text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  subject text,
  text_body text not null,
  html_body text,
  labels text[] not null default '{}',
  provider_message_id text,
  provider_thread_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint outbound_email_actions_status_check check (
    status in ('pending', 'sending', 'sent', 'failed')
  ),
  constraint outbound_email_actions_send_kind_check check (
    send_kind in ('send', 'reply')
  )
);

create index outbound_email_actions_status_idx
  on outbound_email_actions(status, updated_at);
