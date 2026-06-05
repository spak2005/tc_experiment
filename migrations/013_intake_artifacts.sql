create table intake_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tc_profile_id uuid not null references tc_profiles(id) on delete cascade,
  webhook_event_id uuid references webhook_events(id) on delete set null,
  artifact_key text not null,
  inbox_id text not null,
  message_id text,
  thread_id text,
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text not null,
  body_preview text,
  status text not null default 'received',
  extraction_summary jsonb not null default '{}',
  orientation_result jsonb not null default '{}',
  disposition text,
  transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, artifact_key)
);

create table intake_artifact_attachments (
  id uuid primary key default gen_random_uuid(),
  intake_artifact_id uuid not null references intake_artifacts(id) on delete cascade,
  attachment_key text not null,
  filename text not null,
  content_type text,
  blob_key text,
  document_id uuid references documents(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(intake_artifact_id, attachment_key)
);

create index intake_artifacts_user_created_idx
  on intake_artifacts(user_id, created_at desc, id);

create index intake_artifacts_transaction_idx
  on intake_artifacts(transaction_id)
  where transaction_id is not null;

