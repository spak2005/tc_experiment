alter table transactions
  add column coordination_enabled boolean not null default true;

create index transactions_coordination_enabled_idx
  on transactions(user_id, coordination_enabled, status);
