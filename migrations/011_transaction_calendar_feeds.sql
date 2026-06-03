create table transaction_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_accessed_at timestamptz
);

create unique index transaction_calendar_feeds_token_idx
  on transaction_calendar_feeds(token);

create unique index transaction_calendar_feeds_active_transaction_idx
  on transaction_calendar_feeds(transaction_id)
  where revoked_at is null;
