create extension if not exists pgcrypto;

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  market text not null default 'TX',
  brokerage text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  created_at timestamptz not null default now()
);

create table tc_profiles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  display_name text not null,
  inbox_address text not null unique,
  agentmail_pod_id text,
  agentmail_inbox_id text,
  escalation_email text not null,
  market text not null default 'TX',
  default_side text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  tc_profile_id uuid not null references tc_profiles(id) on delete restrict,
  property_address text,
  market text not null default 'TX',
  side text not null default 'unknown',
  status text not null default 'intake_processing',
  phase text,
  current_risk text not null default 'normal',
  effective_date date,
  closing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table parties (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  role text not null,
  name text,
  email text,
  phone text,
  organization text,
  confidence numeric(4, 3),
  source text
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  type text not null,
  name text not null,
  status text not null default 'needed',
  blob_key text,
  source_message_id text,
  created_at timestamptz not null default now()
);

create table extracted_contract_facts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  contract_version text not null,
  facts jsonb not null,
  validation_status text not null,
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  key text not null,
  title text not null,
  phase text not null,
  due_date date,
  source_type text not null,
  source_reference text,
  risk_level text not null default 'normal',
  completed_at timestamptz,
  unique(transaction_id, key)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  title text not null,
  owner_role text not null,
  status text not null default 'not_started',
  due_date date,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete set null,
  agentmail_message_id text not null unique,
  thread_id text,
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text not null,
  received_at timestamptz,
  sent_at timestamptz,
  summary text
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  status text not null default 'pending',
  proposed_subject text not null,
  proposed_body text not null,
  proposed_to text[] not null default '{}',
  proposed_cc text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table blockers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  title text not null,
  details text not null,
  risk_level text not null default 'watch',
  responsible_party_role text,
  deadline_id uuid references milestones(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, external_id)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete set null,
  team_id uuid not null references teams(id) on delete cascade,
  actor text not null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index transactions_team_status_idx on transactions(team_id, status);
create index milestones_due_idx on milestones(due_date) where completed_at is null;
create index tasks_status_due_idx on tasks(status, due_date);
create index messages_thread_idx on messages(thread_id);
create index blockers_open_idx on blockers(risk_level) where resolved_at is null;
