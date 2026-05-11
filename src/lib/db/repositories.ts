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

export async function findTcProfileByInbox(inboxAddress: string) {
  const result = await query<{
    id: string;
    team_id: string;
    inbox_address: string;
    agentmail_inbox_id: string | null;
    escalation_email: string;
    display_name: string;
  }>(
    `select id, team_id, inbox_address, agentmail_inbox_id, escalation_email, display_name
     from tc_profiles
     where inbox_address = $1 or agentmail_inbox_id = $1
     limit 1`,
    [inboxAddress]
  );

  return result.rows[0] ?? null;
}

export async function createTransaction(input: {
  teamId: string;
  tcProfileId: string;
  propertyAddress?: string;
  side?: string;
  effectiveDate?: string;
  closingDate?: string;
  status?: string;
}) {
  const result = await query<{ id: string }>(
    `insert into transactions (
       team_id,
       tc_profile_id,
       property_address,
       side,
       status,
       effective_date,
       closing_date
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      input.teamId,
      input.tcProfileId,
      input.propertyAddress ?? null,
      input.side ?? "unknown",
      input.status ?? "intake_processing",
      input.effectiveDate ?? null,
      input.closingDate ?? null
    ]
  );

  return result.rows[0];
}

export async function saveExtractedContractFacts(input: {
  transactionId: string;
  contractVersion: string;
  facts: Record<string, unknown>;
  validationStatus: string;
}) {
  const result = await query<{ id: string }>(
    `insert into extracted_contract_facts (
       transaction_id,
       contract_version,
       facts,
       validation_status
     )
     values ($1, $2, $3, $4)
     returning id`,
    [
      input.transactionId,
      input.contractVersion,
      input.facts,
      input.validationStatus
    ]
  );

  return result.rows[0];
}

export async function insertMilestones(
  transactionId: string,
  milestones: Array<{
    key: string;
    title: string;
    phase: string;
    dueDate?: string;
    sourceType: string;
    sourceReference?: string;
    riskLevel: string;
  }>
) {
  for (const milestone of milestones) {
    await query(
      `insert into milestones (
         transaction_id,
         key,
         title,
         phase,
         due_date,
         source_type,
         source_reference,
         risk_level
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (transaction_id, key) do update
         set title = excluded.title,
             phase = excluded.phase,
             due_date = excluded.due_date,
             source_type = excluded.source_type,
             source_reference = excluded.source_reference,
             risk_level = excluded.risk_level`,
      [
        transactionId,
        milestone.key,
        milestone.title,
        milestone.phase,
        milestone.dueDate ?? null,
        milestone.sourceType,
        milestone.sourceReference ?? null,
        milestone.riskLevel
      ]
    );
  }
}

export async function insertTasks(
  transactionId: string,
  tasks: Array<{
    title: string;
    ownerRole: string;
    status: string;
    dueDate?: string;
  }>
) {
  for (const task of tasks) {
    await query(
      `insert into tasks (transaction_id, title, owner_role, status, due_date)
       values ($1, $2, $3, $4, $5)`,
      [transactionId, task.title, task.ownerRole, task.status, task.dueDate ?? null]
    );
  }
}
