import { query, type PoolClientLike } from "@/lib/db/client";

export interface CreateTeamInput {
  name: string;
  market: "TX";
  brokerage?: string;
}

export interface CreateUserInput {
  teamId: string;
  name: string;
  email: string;
  phone?: string;
}

export interface CreateTcProfileInput {
  teamId: string;
  displayName: string;
  inboxAddress: string;
  agentMailPodId?: string;
  agentMailInboxId?: string;
  escalationEmail: string;
}

export async function createTeam(input: CreateTeamInput, client?: PoolClientLike) {
  const db = client ?? { query };
  const result = await db.query<{ id: string }>(
    `insert into teams (name, market, brokerage)
     values ($1, $2, $3)
     returning id`,
    [input.name, input.market, input.brokerage ?? null]
  );

  return result.rows[0];
}

export async function createUser(input: CreateUserInput, client?: PoolClientLike) {
  const db = client ?? { query };
  const result = await db.query<{ id: string }>(
    `insert into users (team_id, name, email, phone)
     values ($1, $2, $3, $4)
     returning id`,
    [input.teamId, input.name, input.email, input.phone ?? null]
  );

  return result.rows[0];
}

export async function createTcProfile(
  input: CreateTcProfileInput,
  client?: PoolClientLike
) {
  const db = client ?? { query };
  const result = await db.query<{ id: string; inbox_address: string }>(
    `insert into tc_profiles (
       team_id,
       display_name,
       inbox_address,
       agentmail_pod_id,
       agentmail_inbox_id,
       escalation_email
     )
     values ($1, $2, $3, $4, $5, $6)
     returning id, inbox_address`,
    [
      input.teamId,
      input.displayName,
      input.inboxAddress,
      input.agentMailPodId ?? null,
      input.agentMailInboxId ?? null,
      input.escalationEmail
    ]
  );

  return result.rows[0];
}

export async function recordWebhookEvent(input: {
  provider: string;
  externalId: string;
  payload: Record<string, unknown>;
}) {
  const result = await query<{ id: string; inserted: boolean }>(
    `insert into webhook_events (provider, external_id, payload)
     values ($1, $2, $3)
     on conflict (provider, external_id) do update
       set payload = webhook_events.payload
     returning id, (xmax = 0) as inserted`,
    [input.provider, input.externalId, input.payload]
  );

  return result.rows[0];
}

export async function markWebhookEventProcessed(id: string) {
  await query(
    `update webhook_events
     set processed_at = now()
     where id = $1`,
    [id]
  );
}

export async function createAuditEvent(input: {
  teamId: string;
  transactionId?: string;
  actor: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await query(
    `insert into audit_events (team_id, transaction_id, actor, event_type, payload)
     values ($1, $2, $3, $4, $5)`,
    [
      input.teamId,
      input.transactionId ?? null,
      input.actor,
      input.eventType,
      input.payload ?? {}
    ]
  );
}
