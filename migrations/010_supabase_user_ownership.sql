alter table users
  add column auth_user_id uuid,
  add column brokerage text,
  add column market text not null default 'TX';

update users u
set brokerage = t.brokerage,
    market = t.market
from teams t
where u.team_id = t.id;

-- Existing prototype users predate Supabase Auth, so they cannot be linked
-- to real Supabase identities automatically. Generate placeholders so the
-- schema can become non-null; real signups write the actual Supabase user id.
update users
set auth_user_id = gen_random_uuid()
where auth_user_id is null;

alter table users
  alter column auth_user_id set not null;

alter table users
  add constraint users_auth_user_id_key unique (auth_user_id);

alter table tc_profiles add column user_id uuid;
alter table transactions add column user_id uuid;
alter table audit_events add column user_id uuid;
alter table agent_decisions add column user_id uuid;
alter table agent_activity_events add column user_id uuid;
alter table agent_wakeups add column user_id uuid;

with owner_by_team as (
  select distinct on (team_id)
    team_id,
    id as user_id
  from users
  order by team_id, created_at, id
)
update tc_profiles p
set user_id = owner.user_id
from owner_by_team owner
where p.team_id = owner.team_id;

with owner_by_team as (
  select distinct on (team_id)
    team_id,
    id as user_id
  from users
  order by team_id, created_at, id
)
update transactions t
set user_id = owner.user_id
from owner_by_team owner
where t.team_id = owner.team_id;

with owner_by_team as (
  select distinct on (team_id)
    team_id,
    id as user_id
  from users
  order by team_id, created_at, id
)
update audit_events e
set user_id = owner.user_id
from owner_by_team owner
where e.team_id = owner.team_id;

with owner_by_team as (
  select distinct on (team_id)
    team_id,
    id as user_id
  from users
  order by team_id, created_at, id
)
update agent_decisions d
set user_id = owner.user_id
from owner_by_team owner
where d.team_id = owner.team_id;

with owner_by_team as (
  select distinct on (team_id)
    team_id,
    id as user_id
  from users
  order by team_id, created_at, id
)
update agent_activity_events e
set user_id = owner.user_id
from owner_by_team owner
where e.team_id = owner.team_id;

with owner_by_team as (
  select distinct on (team_id)
    team_id,
    id as user_id
  from users
  order by team_id, created_at, id
)
update agent_wakeups w
set user_id = owner.user_id
from owner_by_team owner
where w.team_id = owner.team_id;

alter table tc_profiles alter column user_id set not null;
alter table transactions alter column user_id set not null;
alter table audit_events alter column user_id set not null;
alter table agent_decisions alter column user_id set not null;
alter table agent_activity_events alter column user_id set not null;
alter table agent_wakeups alter column user_id set not null;

alter table tc_profiles
  add constraint tc_profiles_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

alter table transactions
  add constraint transactions_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

alter table audit_events
  add constraint audit_events_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

alter table agent_decisions
  add constraint agent_decisions_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

alter table agent_activity_events
  add constraint agent_activity_events_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

alter table agent_wakeups
  add constraint agent_wakeups_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

create index transactions_user_status_idx on transactions(user_id, status);
create index agent_decisions_user_created_idx
  on agent_decisions(user_id, created_at desc);
create index agent_activity_events_user_occurred_idx
  on agent_activity_events(user_id, occurred_at desc, id);

drop index if exists transactions_team_status_idx;
drop index if exists agent_decisions_team_created_idx;
drop index if exists agent_activity_events_team_occurred_idx;

alter table users drop constraint if exists users_team_id_fkey;
alter table tc_profiles drop constraint if exists tc_profiles_team_id_fkey;
alter table transactions drop constraint if exists transactions_team_id_fkey;
alter table audit_events drop constraint if exists audit_events_team_id_fkey;
alter table agent_decisions drop constraint if exists agent_decisions_team_id_fkey;
alter table agent_activity_events drop constraint if exists agent_activity_events_team_id_fkey;
alter table agent_wakeups drop constraint if exists agent_wakeups_team_id_fkey;

alter table users drop column team_id;
alter table tc_profiles drop column team_id;
alter table transactions drop column team_id;
alter table audit_events drop column team_id;
alter table agent_decisions drop column team_id;
alter table agent_activity_events drop column team_id;
alter table agent_wakeups drop column team_id;

drop table teams;
