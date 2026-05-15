import { query, withTransaction, type PoolClientLike } from "@/lib/db/client";
import type {
  AgentActivityEvent,
  CreateAgentActivityEventInput
} from "@/lib/agent/activity";
import {
  mapLegacyRecordsToActivity,
  sortActivityTimeline
} from "@/lib/agent/activity-timeline";
import type {
  AgentWakeup,
  AgentWakeupActionType,
  AgentWakeupStatus
} from "@/lib/domain/types";

function toJsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

function toActivityEvent(row: {
  id: string;
  team_id: string;
  transaction_id: string | null;
  property_address?: string | null;
  transaction_status?: string | null;
  agent_decision_id: string | null;
  source_type: AgentActivityEvent["sourceType"];
  event_type: string;
  title: string;
  summary: string;
  status: AgentActivityEvent["status"];
  metadata: unknown;
  occurred_at: string;
}): AgentActivityEvent {
  return {
    id: row.id,
    teamId: row.team_id,
    transactionId: row.transaction_id ?? undefined,
    transaction: row.transaction_id
      ? {
          id: row.transaction_id,
          propertyAddress: row.property_address ?? undefined,
          status: row.transaction_status ?? undefined
        }
      : undefined,
    agentDecisionId: row.agent_decision_id ?? undefined,
    sourceType: row.source_type,
    eventType: row.event_type,
    title: row.title,
    summary: row.summary,
    status: row.status,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    occurredAt: row.occurred_at
  };
}

type AgentWakeupRow = {
  id: string;
  team_id: string;
  transaction_id: string;
  task_id: string | null;
  action_type: AgentWakeupActionType;
  reason: string;
  status: AgentWakeupStatus;
  dedupe_key: string;
  wake_at: string;
  payload: unknown;
  preconditions: unknown;
  attempt_count: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

function toAgentWakeup(row: AgentWakeupRow): AgentWakeup {
  return {
    id: row.id,
    teamId: row.team_id,
    transactionId: row.transaction_id,
    taskId: row.task_id ?? undefined,
    actionType: row.action_type,
    reason: row.reason,
    status: row.status,
    dedupeKey: row.dedupe_key,
    wakeAt: row.wake_at,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    preconditions:
      row.preconditions && typeof row.preconditions === "object"
        ? (row.preconditions as Record<string, unknown>)
        : {},
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lockedAt: row.locked_at ?? undefined,
    lockedBy: row.locked_by ?? undefined,
    lastError: row.last_error ?? undefined,
    completedAt: row.completed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

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

export async function createAgentActivityEvent(
  input: CreateAgentActivityEventInput,
  client?: PoolClientLike
) {
  const db = client ?? { query };
  const result = await db.query<{
    id: string;
    team_id: string;
    transaction_id: string | null;
    agent_decision_id: string | null;
    source_type: AgentActivityEvent["sourceType"];
    event_type: string;
    title: string;
    summary: string;
    status: AgentActivityEvent["status"];
    metadata: unknown;
    occurred_at: string;
  }>(
    `insert into agent_activity_events (
       team_id,
       transaction_id,
       agent_decision_id,
       source_type,
       event_type,
       title,
       summary,
       status,
       metadata,
       occurred_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, now()))
     returning
       id,
       team_id,
       transaction_id,
       agent_decision_id,
       source_type,
       event_type,
       title,
       summary,
       status,
       metadata,
       occurred_at::text`,
    [
      input.teamId,
      input.transactionId ?? null,
      input.agentDecisionId ?? null,
      input.sourceType,
      input.eventType,
      input.title,
      input.summary ?? "",
      input.status,
      toJsonb(input.metadata ?? {}),
      input.occurredAt ?? null
    ]
  );

  return toActivityEvent(result.rows[0]);
}

export async function getTransactionActivityEvents(transactionId: string) {
  const result = await query<{
    id: string;
    team_id: string;
    transaction_id: string | null;
    agent_decision_id: string | null;
    source_type: AgentActivityEvent["sourceType"];
    event_type: string;
    title: string;
    summary: string;
    status: AgentActivityEvent["status"];
    metadata: unknown;
    occurred_at: string;
  }>(
    `select
       id,
       team_id,
       transaction_id,
       agent_decision_id,
       source_type,
       event_type,
       title,
       summary,
       status,
       metadata,
       occurred_at::text
     from agent_activity_events
     where transaction_id = $1
     order by occurred_at, id`,
    [transactionId]
  );

  return result.rows.map(toActivityEvent);
}

export async function getTeamActivityTimeline(teamId: string, limit = 100) {
  const result = await query<{
    id: string;
    team_id: string;
    transaction_id: string | null;
    property_address: string | null;
    transaction_status: string | null;
    agent_decision_id: string | null;
    source_type: AgentActivityEvent["sourceType"];
    event_type: string;
    title: string;
    summary: string;
    status: AgentActivityEvent["status"];
    metadata: unknown;
    occurred_at: string;
  }>(
    `select
       e.id,
       e.team_id,
       e.transaction_id,
       t.property_address,
       t.status as transaction_status,
       e.agent_decision_id,
       e.source_type,
       e.event_type,
       e.title,
       e.summary,
       e.status,
       e.metadata,
       e.occurred_at::text
     from agent_activity_events e
     left join transactions t on t.id = e.transaction_id
     where e.team_id = $1
     order by e.occurred_at desc, e.id desc
     limit $2`,
    [teamId, limit]
  );

  return result.rows.map(toActivityEvent);
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
    [input.provider, input.externalId, toJsonb(input.payload)]
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
      toJsonb(input.payload ?? {})
    ]
  );
}

const agentWakeupColumns = `
  id,
  team_id,
  transaction_id,
  task_id,
  action_type,
  reason,
  status,
  dedupe_key,
  wake_at::text,
  payload,
  preconditions,
  attempt_count,
  max_attempts,
  locked_at::text,
  locked_by,
  last_error,
  completed_at::text,
  cancelled_at::text,
  created_at::text,
  updated_at::text
`;

export async function createAgentWakeup(input: {
  teamId: string;
  transactionId: string;
  taskId?: string;
  actionType: AgentWakeupActionType;
  reason: string;
  dedupeKey: string;
  wakeAt: string;
  payload?: Record<string, unknown>;
  preconditions?: Record<string, unknown>;
  maxAttempts?: number;
}) {
  const result = await query<AgentWakeupRow>(
    `insert into agent_wakeups (
       team_id,
       transaction_id,
       task_id,
       action_type,
       reason,
       dedupe_key,
       wake_at,
       payload,
       preconditions,
       max_attempts
     )
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10)
     on conflict (dedupe_key) where status in ('pending', 'running') do update
       set wake_at = excluded.wake_at,
           reason = excluded.reason,
           payload = excluded.payload,
           preconditions = excluded.preconditions,
           max_attempts = excluded.max_attempts,
           updated_at = now()
     returning ${agentWakeupColumns}`,
    [
      input.teamId,
      input.transactionId,
      input.taskId ?? null,
      input.actionType,
      input.reason,
      input.dedupeKey,
      input.wakeAt,
      toJsonb(input.payload ?? {}),
      toJsonb(input.preconditions ?? {}),
      input.maxAttempts ?? 3
    ]
  );

  return toAgentWakeup(result.rows[0]);
}

export async function completeAgentWakeup(input: {
  id: string;
  status?: Extract<AgentWakeupStatus, "completed" | "skipped">;
  payload?: Record<string, unknown>;
}) {
  const result = await query<AgentWakeupRow>(
    `update agent_wakeups
     set status = $2,
         payload = case
           when $3::jsonb = '{}'::jsonb then payload
           else payload || $3::jsonb
         end,
         completed_at = now(),
         locked_at = null,
         locked_by = null,
         updated_at = now()
     where id = $1
     returning ${agentWakeupColumns}`,
    [input.id, input.status ?? "completed", toJsonb(input.payload ?? {})]
  );

  return result.rows[0] ? toAgentWakeup(result.rows[0]) : null;
}

export async function failAgentWakeup(input: {
  id: string;
  error: string;
  retryAt?: string;
}) {
  const result = await query<AgentWakeupRow>(
    `update agent_wakeups
     set status = case
           when attempt_count >= max_attempts then 'failed'
           else 'pending'
         end,
         wake_at = case
           when attempt_count >= max_attempts then wake_at
           else coalesce($3::timestamptz, now() + interval '30 minutes')
         end,
         last_error = $2,
         locked_at = null,
         locked_by = null,
         updated_at = now()
     where id = $1
     returning ${agentWakeupColumns}`,
    [input.id, input.error, input.retryAt ?? null]
  );

  return result.rows[0] ? toAgentWakeup(result.rows[0]) : null;
}

export async function cancelPendingAgentWakeups(input: {
  transactionId: string;
  actionType?: AgentWakeupActionType;
  taskId?: string;
  reason?: string;
}) {
  const result = await query<AgentWakeupRow>(
    `update agent_wakeups
     set status = 'cancelled',
         cancelled_at = now(),
         last_error = coalesce($4, last_error),
         locked_at = null,
         locked_by = null,
         updated_at = now()
     where transaction_id = $1
       and status in ('pending', 'running')
       and ($2::text is null or action_type = $2)
       and ($3::uuid is null or task_id = $3::uuid)
     returning ${agentWakeupColumns}`,
    [
      input.transactionId,
      input.actionType ?? null,
      input.taskId ?? null,
      input.reason ?? null
    ]
  );

  return result.rows.map(toAgentWakeup);
}

export async function listTransactionWakeups(input: {
  transactionId: string;
  statuses?: AgentWakeupStatus[];
}) {
  const result = await query<AgentWakeupRow>(
    `select ${agentWakeupColumns}
     from agent_wakeups
     where transaction_id = $1
       and ($2::text[] is null or status = any($2::text[]))
     order by wake_at asc, created_at asc`,
    [input.transactionId, input.statuses ?? null]
  );

  return result.rows.map(toAgentWakeup);
}

export async function claimDueAgentWakeups(input: {
  now: string;
  limit: number;
  workerId: string;
}) {
  return withTransaction(async (client) => {
    const result = await client.query<AgentWakeupRow>(
      `with due as (
         select id
         from agent_wakeups
         where status = 'pending'
           and wake_at <= $1::timestamptz
         order by wake_at asc, created_at asc
         limit $2
         for update skip locked
       )
       update agent_wakeups wakeup
       set status = 'running',
           locked_at = now(),
           locked_by = $3,
           attempt_count = attempt_count + 1,
           updated_at = now()
       from due
       where wakeup.id = due.id
       returning
         wakeup.id,
         wakeup.team_id,
         wakeup.transaction_id,
         wakeup.task_id,
         wakeup.action_type,
         wakeup.reason,
         wakeup.status,
         wakeup.dedupe_key,
         wakeup.wake_at::text,
         wakeup.payload,
         wakeup.preconditions,
         wakeup.attempt_count,
         wakeup.max_attempts,
         wakeup.locked_at::text,
         wakeup.locked_by,
         wakeup.last_error,
         wakeup.completed_at::text,
         wakeup.cancelled_at::text,
         wakeup.created_at::text,
         wakeup.updated_at::text`,
      [input.now, input.limit, input.workerId]
    );

    return result.rows.map(toAgentWakeup);
  });
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

export async function findTcProfileByTransaction(transactionId: string) {
  const result = await query<{
    id: string;
    team_id: string;
    inbox_address: string;
    agentmail_inbox_id: string | null;
    escalation_email: string;
    display_name: string;
  }>(
    `select
       tc.id,
       tc.team_id,
       tc.inbox_address,
       tc.agentmail_inbox_id,
       tc.escalation_email,
       tc.display_name
     from transactions t
     join tc_profiles tc on tc.id = t.tc_profile_id
     where t.id = $1
     limit 1`,
    [transactionId]
  );

  return result.rows[0] ?? null;
}

export async function getTransactionParties(transactionId: string) {
  const result = await query<{
    id: string;
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    organization: string | null;
    confidence: string | null;
    source: string | null;
  }>(
    `select id, role, name, email, phone, organization, confidence::text, source
     from parties
     where transaction_id = $1
     order by role, name nulls last, organization nulls last`,
    [transactionId]
  );

  return result.rows;
}

export async function createTransaction(input: {
  teamId: string;
  tcProfileId: string;
  propertyAddress?: string;
  side?: string;
  effectiveDate?: string;
  closingDate?: string;
  status?: string;
  intakeSourceKey?: string;
}) {
  const result = await query<{ id: string }>(
    `insert into transactions (
       team_id,
       tc_profile_id,
       property_address,
       side,
       status,
       effective_date,
       closing_date,
       intake_source_key
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      input.teamId,
      input.tcProfileId,
      input.propertyAddress ?? null,
      input.side ?? "unknown",
      input.status ?? "intake_processing",
      input.effectiveDate ?? null,
      input.closingDate ?? null,
      input.intakeSourceKey ?? null
    ]
  );

  return result.rows[0];
}

export async function findOrCreateTransactionForIntake(input: {
  teamId: string;
  tcProfileId: string;
  intakeSourceKey: string;
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
       closing_date,
       intake_source_key
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (intake_source_key) where intake_source_key is not null do update
       set intake_source_key = excluded.intake_source_key
     returning id`,
    [
      input.teamId,
      input.tcProfileId,
      input.propertyAddress ?? null,
      input.side ?? "unknown",
      input.status ?? "intake_processing",
      input.effectiveDate ?? null,
      input.closingDate ?? null,
      input.intakeSourceKey
    ]
  );

  return result.rows[0];
}

export async function updateTransactionFromFacts(input: {
  transactionId: string;
  propertyAddress?: string;
  effectiveDate?: string;
  closingDate?: string;
  status: string;
  phase?: string;
}) {
  await query(
    `update transactions
     set property_address = coalesce($2, property_address),
         effective_date = coalesce($3::date, effective_date),
         closing_date = coalesce($4::date, closing_date),
         status = $5,
         phase = coalesce($6, phase),
         updated_at = now()
     where id = $1`,
    [
      input.transactionId,
      input.propertyAddress ?? null,
      input.effectiveDate ?? null,
      input.closingDate ?? null,
      input.status,
      input.phase ?? null
    ]
  );
}

export async function getTransactionCore(transactionId: string) {
  const result = await query<{
    id: string;
    property_address: string | null;
    side: string;
    status: string;
    phase: string | null;
    current_risk: string;
    effective_date: string | null;
    closing_date: string | null;
  }>(
    `select
       id,
       property_address,
       side,
       status,
       phase,
       current_risk,
       effective_date::text,
       closing_date::text
     from transactions
     where id = $1`,
    [transactionId]
  );

  return result.rows[0] ?? null;
}

export async function updateTransactionCoreFields(input: {
  transactionId: string;
  propertyAddress?: string;
  side?: string;
  status?: string;
  phase?: string;
  currentRisk?: string;
  effectiveDate?: string;
  closingDate?: string;
}) {
  const result = await query<{
    id: string;
    property_address: string | null;
    side: string;
    status: string;
    phase: string | null;
    current_risk: string;
    effective_date: string | null;
    closing_date: string | null;
  }>(
    `update transactions
     set property_address = coalesce($2, property_address),
         side = coalesce($3, side),
         status = coalesce($4, status),
         phase = coalesce($5, phase),
         current_risk = coalesce($6, current_risk),
         effective_date = coalesce($7::date, effective_date),
         closing_date = coalesce($8::date, closing_date),
         updated_at = now()
     where id = $1
     returning
       id,
       property_address,
       side,
       status,
       phase,
       current_risk,
       effective_date::text,
       closing_date::text`,
    [
      input.transactionId,
      input.propertyAddress ?? null,
      input.side ?? null,
      input.status ?? null,
      input.phase ?? null,
      input.currentRisk ?? null,
      input.effectiveDate ?? null,
      input.closingDate ?? null
    ]
  );

  return result.rows[0] ?? null;
}

export async function getTransactionFact(input: {
  transactionId: string;
  key: string;
}) {
  const result = await query<{
    transaction_id: string;
    key: string;
    value: unknown;
    confidence: string;
    source_type: string;
    source_reference: string | null;
    needs_confirmation: boolean;
    updated_at: string;
  }>(
    `select
       transaction_id,
       key,
       value,
       confidence::text,
       source_type,
       source_reference,
       needs_confirmation,
       updated_at::text
     from transaction_facts
     where transaction_id = $1 and key = $2`,
    [input.transactionId, input.key]
  );

  return result.rows[0] ?? null;
}

export async function getTransactionFacts(transactionId: string) {
  const result = await query<{
    transaction_id: string;
    key: string;
    value: unknown;
    confidence: string;
    source_type: string;
    source_reference: string | null;
    needs_confirmation: boolean;
    updated_at: string;
  }>(
    `select
       transaction_id,
       key,
       value,
       confidence::text,
       source_type,
       source_reference,
       needs_confirmation,
       updated_at::text
     from transaction_facts
     where transaction_id = $1
     order by key`,
    [transactionId]
  );

  return result.rows;
}

export async function upsertTransactionFact(input: {
  transactionId: string;
  key: string;
  value: unknown;
  confidence: number;
  sourceType: string;
  sourceReference?: string;
  needsConfirmation?: boolean;
}) {
  const result = await query<{
    transaction_id: string;
    key: string;
    value: unknown;
    confidence: string;
    source_type: string;
    source_reference: string | null;
    needs_confirmation: boolean;
    updated_at: string;
  }>(
    `insert into transaction_facts (
       transaction_id,
       key,
       value,
       confidence,
       source_type,
       source_reference,
       needs_confirmation
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (transaction_id, key) do update
       set value = excluded.value,
           confidence = excluded.confidence,
           source_type = excluded.source_type,
           source_reference = excluded.source_reference,
           needs_confirmation = excluded.needs_confirmation,
           updated_at = now()
     returning
       transaction_id,
       key,
       value,
       confidence::text,
       source_type,
       source_reference,
       needs_confirmation,
       updated_at::text`,
    [
      input.transactionId,
      input.key,
      toJsonb(input.value),
      input.confidence,
      input.sourceType,
      input.sourceReference ?? null,
      input.needsConfirmation ?? false
    ]
  );

  return result.rows[0];
}

export async function createTransactionChangeEvent(input: {
  transactionId: string;
  agentDecisionId?: string;
  changeType: string;
  targetType: string;
  targetId?: string;
  fieldKey: string;
  previousValue?: unknown;
  newValue?: unknown;
  sourceType: string;
  sourceReference?: string;
  confidence: number;
  approvalStatus: string;
}) {
  const result = await query<{ id: string }>(
    `insert into transaction_change_events (
       transaction_id,
       agent_decision_id,
       change_type,
       target_type,
       target_id,
       field_key,
       previous_value,
       new_value,
       source_type,
       source_reference,
       confidence,
       approval_status
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      input.transactionId,
      input.agentDecisionId ?? null,
      input.changeType,
      input.targetType,
      input.targetId ?? null,
      input.fieldKey,
      toJsonb(input.previousValue),
      toJsonb(input.newValue),
      input.sourceType,
      input.sourceReference ?? null,
      input.confidence,
      input.approvalStatus
    ]
  );

  return result.rows[0];
}

export async function getRecentTransactionChangeEvents(transactionId: string, limit = 20) {
  const result = await query<{
    id: string;
    transaction_id: string;
    agent_decision_id: string | null;
    change_type: string;
    target_type: string;
    target_id: string | null;
    field_key: string;
    previous_value: unknown;
    new_value: unknown;
    source_type: string;
    source_reference: string | null;
    confidence: string;
    approval_status: string;
    created_at: string;
  }>(
    `select
       id,
       transaction_id,
       agent_decision_id,
       change_type,
       target_type,
       target_id,
       field_key,
       previous_value,
       new_value,
       source_type,
       source_reference,
       confidence::text,
       approval_status,
       created_at::text
     from transaction_change_events
     where transaction_id = $1
     order by created_at desc, id desc
     limit $2`,
    [transactionId, limit]
  );

  return result.rows;
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
      toJsonb(input.facts),
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
    metadata?: Record<string, unknown>;
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
         risk_level,
         metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (transaction_id, key) do update
         set title = excluded.title,
             phase = excluded.phase,
             due_date = excluded.due_date,
             source_type = excluded.source_type,
             source_reference = excluded.source_reference,
             risk_level = excluded.risk_level,
             metadata = excluded.metadata`,
      [
        transactionId,
        milestone.key,
        milestone.title,
        milestone.phase,
        milestone.dueDate ?? null,
        milestone.sourceType,
        milestone.sourceReference ?? null,
        milestone.riskLevel,
        toJsonb(milestone.metadata ?? {})
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
    followUpDueDate?: string;
    metadata?: Record<string, unknown>;
  }>
) {
  for (const task of tasks) {
    await query(
      `insert into tasks (
         transaction_id,
         title,
         owner_role,
         status,
         due_date,
         follow_up_due_date,
         metadata
       )
       select $1, $2, $3, $4, $5, $6, $7
       where not exists (
         select 1
         from tasks
         where transaction_id = $1
           and title = $2
           and owner_role = $3
       )`,
      [
        transactionId,
        task.title,
        task.ownerRole,
        task.status,
        task.dueDate ?? null,
        task.followUpDueDate ?? null,
        toJsonb(task.metadata ?? {})
      ]
    );
  }
}

export async function upsertMilestoneRecord(input: {
  transactionId: string;
  key: string;
  title: string;
  phase: string;
  dueDate?: string | null;
  sourceType: string;
  sourceReference?: string;
  riskLevel: string;
  completedAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await query<{ id: string }>(
    `insert into milestones (
       transaction_id,
       key,
       title,
       phase,
       due_date,
       source_type,
       source_reference,
       risk_level,
       completed_at,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (transaction_id, key) do update
       set title = excluded.title,
           phase = excluded.phase,
           due_date = excluded.due_date,
           source_type = excluded.source_type,
           source_reference = excluded.source_reference,
           risk_level = excluded.risk_level,
           completed_at = excluded.completed_at,
           metadata = excluded.metadata
     returning id`,
    [
      input.transactionId,
      input.key,
      input.title,
      input.phase,
      input.dueDate ?? null,
      input.sourceType,
      input.sourceReference ?? null,
      input.riskLevel,
      input.completedAt ?? null,
      toJsonb(input.metadata ?? {})
    ]
  );

  return result.rows[0];
}

export async function upsertTaskRecord(input: {
  transactionId: string;
  id?: string;
  title?: string;
  ownerRole?: string;
  status?: string;
  dueDate?: string | null;
  followUpDueDate?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const existing = await query<{ id: string }>(
    `select id
     from tasks
     where transaction_id = $1
       and (
         ($2::uuid is not null and id = $2::uuid) or
         ($3::text is not null and $4::text is not null and title = $3::text and owner_role = $4::text)
       )
     order by id
     limit 1`,
    [
      input.transactionId,
      input.id ?? null,
      input.title ?? null,
      input.ownerRole ?? null
    ]
  );

  if (existing.rows[0]) {
    const result = await query<{ id: string }>(
      `update tasks
       set title = coalesce($2, title),
           owner_role = coalesce($3, owner_role),
           status = coalesce($4, status),
           due_date = coalesce($5::date, due_date),
           follow_up_due_date = coalesce($6::date, follow_up_due_date),
           metadata = case
             when $7::jsonb = '{}'::jsonb then metadata
             else metadata || $7::jsonb
           end
       where id = $1
       returning id`,
      [
        existing.rows[0].id,
        input.title ?? null,
        input.ownerRole ?? null,
        input.status ?? null,
        input.dueDate ?? null,
        input.followUpDueDate ?? null,
        toJsonb(input.metadata ?? {})
      ]
    );

    return { id: result.rows[0].id, inserted: false };
  }

  if (!input.title || !input.ownerRole) {
    return null;
  }

  const result = await query<{ id: string }>(
    `insert into tasks (
       transaction_id,
       title,
       owner_role,
       status,
       due_date,
       follow_up_due_date,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      input.transactionId,
      input.title,
      input.ownerRole,
      input.status ?? "not_started",
      input.dueDate ?? null,
      input.followUpDueDate ?? null,
      toJsonb(input.metadata ?? {})
    ]
  );

  return { id: result.rows[0].id, inserted: true };
}

export interface OpenTaskRow {
  id: string;
  transaction_id: string;
  title: string;
  owner_role: string;
  status: string;
  due_date: string | null;
  follow_up_due_date: string | null;
  metadata: Record<string, unknown>;
}

const openTaskSelect = `
  id,
  transaction_id,
  title,
  owner_role,
  status,
  due_date::text as due_date,
  follow_up_due_date::text as follow_up_due_date,
  metadata
`;

export async function getTaskById(taskId: string): Promise<OpenTaskRow | null> {
  const result = await query<OpenTaskRow>(
    `select ${openTaskSelect}
     from tasks
     where id = $1`,
    [taskId]
  );

  return result.rows[0] ?? null;
}

export async function findOpenTasksByOwnerRole(input: {
  transactionId: string;
  ownerRole: string;
}): Promise<OpenTaskRow[]> {
  const result = await query<OpenTaskRow>(
    `select ${openTaskSelect}
     from tasks
     where transaction_id = $1
       and owner_role = $2
       and status not in ('complete', 'cancelled')
     order by
       case when due_date is null then 1 else 0 end,
       due_date asc,
       created_at asc`,
    [input.transactionId, input.ownerRole]
  );

  return result.rows;
}

export async function findPartyRolesByEmails(input: {
  transactionId: string;
  emails: string[];
}): Promise<string[]> {
  if (input.emails.length === 0) return [];

  const normalized = input.emails
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  if (normalized.length === 0) return [];

  const result = await query<{ role: string }>(
    `select distinct role
     from parties
     where transaction_id = $1
       and email is not null
       and lower(email) = any($2::text[])`,
    [input.transactionId, normalized]
  );

  return result.rows.map((row) => row.role);
}

export async function createMessage(input: {
  transactionId?: string;
  agentMailMessageId: string;
  threadId?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  receivedAt?: Date;
  sentAt?: Date;
  summary?: string;
}) {
  await query(
    `insert into messages (
       transaction_id,
       agentmail_message_id,
       thread_id,
       from_address,
       to_addresses,
       cc_addresses,
       subject,
       received_at,
       sent_at,
       summary
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (agentmail_message_id) do nothing`,
    [
      input.transactionId ?? null,
      input.agentMailMessageId,
      input.threadId ?? null,
      input.from,
      input.to,
      input.cc,
      input.subject,
      input.receivedAt ?? null,
      input.sentAt ?? null,
      input.summary ?? null
    ]
  );
}

export async function createDocumentRecord(input: {
  transactionId: string;
  type: string;
  name: string;
  status: string;
  blobKey?: string;
  sourceMessageId?: string;
  ownerRole?: string;
  dueDate?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await query<{ id: string }>(
    `insert into documents (
       transaction_id,
       type,
       name,
       status,
       blob_key,
       source_message_id,
       owner_role,
       due_date,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      input.transactionId,
      input.type,
      input.name,
      input.status,
      input.blobKey ?? null,
      input.sourceMessageId ?? null,
      input.ownerRole ?? null,
      input.dueDate ?? null,
      toJsonb(input.metadata ?? {})
    ]
  );

  return result.rows[0];
}

export async function upsertParty(input: {
  transactionId: string;
  role: string;
  name?: string;
  email?: string;
  phone?: string;
  organization?: string;
  confidence?: number;
  source?: string;
}) {
  const existing = await query<{ id: string }>(
    `select id
     from parties
     where transaction_id = $1
       and role = $2
       and (
         ($3::text is not null and lower(email) = lower($3::text)) or
         ($4::text is not null and lower(name) = lower($4::text)) or
         ($5::text is not null and lower(organization) = lower($5::text))
       )
     order by id
     limit 1`,
    [
      input.transactionId,
      input.role,
      input.email ?? null,
      input.name ?? null,
      input.organization ?? null
    ]
  );

  if (existing.rows[0]) {
    const result = await query<{ id: string }>(
      `update parties
       set name = coalesce($2, name),
           email = coalesce($3, email),
           phone = coalesce($4, phone),
           organization = coalesce($5, organization),
           confidence = coalesce($6, confidence),
           source = coalesce($7, source)
       where id = $1
       returning id`,
      [
        existing.rows[0].id,
        input.name ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.organization ?? null,
        input.confidence ?? null,
        input.source ?? null
      ]
    );

    return { id: result.rows[0].id, inserted: false };
  }

  const result = await query<{ id: string }>(
    `insert into parties (
       transaction_id,
       role,
       name,
       email,
       phone,
       organization,
       confidence,
       source
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      input.transactionId,
      input.role,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.organization ?? null,
      input.confidence ?? null,
      input.source ?? null
    ]
  );

  return { id: result.rows[0].id, inserted: true };
}

export async function updateDocumentRecord(input: {
  transactionId: string;
  id?: string;
  name?: string;
  type?: string;
  status: string;
  ownerRole?: string;
  dueDate?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await query<{
    id: string;
    type: string;
    name: string;
    status: string;
    inserted?: boolean;
  }>(
    `update documents
     set type = coalesce($4, type),
         status = $5,
         owner_role = coalesce($6, owner_role),
         due_date = coalesce($7::date, due_date),
         metadata = case
           when $8::jsonb = '{}'::jsonb then metadata
           else metadata || $8::jsonb
         end
     where transaction_id = $1
       and (
         ($2::uuid is not null and id = $2::uuid) or
         ($3::text is not null and name = $3::text)
       )
     returning id, type, name, status, false as inserted`,
    [
      input.transactionId,
      input.id ?? null,
      input.name ?? null,
      input.type ?? null,
      input.status,
      input.ownerRole ?? null,
      input.dueDate ?? null,
      toJsonb(input.metadata ?? {})
    ]
  );

  if (result.rows[0] || !input.name || !input.type) {
    return result.rows[0] ?? null;
  }

  const inserted = await query<{
    id: string;
    type: string;
    name: string;
    status: string;
    inserted: boolean;
  }>(
    `insert into documents (
       transaction_id,
       type,
       name,
       status,
       owner_role,
       due_date,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, type, name, status, true as inserted`,
    [
      input.transactionId,
      input.type,
      input.name,
      input.status,
      input.ownerRole ?? null,
      input.dueDate ?? null,
      toJsonb(input.metadata ?? {})
    ]
  );

  return inserted.rows[0] ?? null;
}

export async function findTransactionMatchCandidates(teamId: string) {
  const result = await query<{
    id: string;
    property_address: string | null;
    status: string;
    phase: string | null;
    effective_date: string | null;
    closing_date: string | null;
    updated_at: string;
    latest_facts: unknown;
    party_emails: string[];
    party_names: string[];
    thread_ids: string[];
    recent_subjects: string[];
  }>(
    `select
       t.id,
       t.property_address,
       t.status,
       t.phase,
       t.effective_date::text,
       t.closing_date::text,
       t.updated_at::text,
       f.facts as latest_facts,
       coalesce(array_remove(array_agg(distinct lower(p.email)), null), '{}') as party_emails,
       coalesce(array_remove(array_agg(distinct lower(p.name)), null), '{}') as party_names,
       coalesce(array_remove(array_agg(distinct m.thread_id), null), '{}') as thread_ids,
       coalesce(array_remove(array_agg(distinct lower(m.subject)), null), '{}') as recent_subjects
     from transactions t
     left join lateral (
       select facts
       from extracted_contract_facts
       where transaction_id = t.id
       order by created_at desc
       limit 1
     ) f on true
     left join parties p on p.transaction_id = t.id
     left join messages m on m.transaction_id = t.id
     where t.team_id = $1
       and t.status not in ('closed', 'terminated')
     group by t.id, f.facts
     order by t.updated_at desc
     limit 25`,
    [teamId]
  );

  return result.rows;
}

export async function getTransactionContextData(transactionId: string) {
  const [
    transaction,
    facts,
    milestones,
    tasks,
    documents,
    messages,
    blockers,
    memory,
    recentDecisions,
    canonicalFacts,
    recentChanges
  ] = await Promise.all([
    query<{
      id: string;
      team_id: string;
      property_address: string | null;
      status: string;
      phase: string | null;
      current_risk: string;
      effective_date: string | null;
      closing_date: string | null;
      updated_at: string;
    }>(
      `select
         id,
         team_id,
         property_address,
         status,
         phase,
         current_risk,
         effective_date::text,
         closing_date::text,
         updated_at::text
       from transactions
       where id = $1`,
      [transactionId]
    ),
    query<{ contract_version: string; validation_status: string; facts: unknown; created_at: string }>(
      `select contract_version, validation_status, facts, created_at::text
       from extracted_contract_facts
       where transaction_id = $1
       order by created_at desc
       limit 1`,
      [transactionId]
    ),
    query<{
      id: string;
      key: string;
      title: string;
      phase: string;
      due_date: string | null;
      source_reference: string | null;
      risk_level: string;
      completed_at: string | null;
      metadata: unknown;
    }>(
      `select id, key, title, phase, due_date::text, source_reference, risk_level, completed_at::text, metadata
       from milestones
       where transaction_id = $1
       order by due_date nulls last, title`,
      [transactionId]
    ),
    query<{
      id: string;
      title: string;
      owner_role: string;
      status: string;
      due_date: string | null;
      follow_up_due_date: string | null;
      metadata: unknown;
    }>(
      `select id, title, owner_role, status, due_date::text, follow_up_due_date::text, metadata
       from tasks
       where transaction_id = $1
       order by due_date nulls last, created_at`,
      [transactionId]
    ),
    query<{
      id: string;
      type: string;
      name: string;
      status: string;
      blob_key: string | null;
      owner_role: string | null;
      due_date: string | null;
      metadata: unknown;
      created_at: string;
    }>(
      `select id, type, name, status, blob_key, owner_role, due_date::text, metadata, created_at::text
       from documents
       where transaction_id = $1
       order by created_at desc`,
      [transactionId]
    ),
    query<{
      from_address: string;
      to_addresses: string[];
      cc_addresses: string[];
      subject: string;
      thread_id: string | null;
      received_at: string | null;
      sent_at: string | null;
      summary: string | null;
    }>(
      `select from_address, to_addresses, cc_addresses, subject, thread_id, received_at::text, sent_at::text, summary
       from messages
       where transaction_id = $1
       order by coalesce(received_at, sent_at) desc nulls last
       limit 25`,
      [transactionId]
    ),
    query<{
      id: string;
      title: string;
      details: string;
      risk_level: string;
      responsible_party_role: string | null;
      deadline_id: string | null;
      task_id: string | null;
      created_at: string;
    }>(
      `select id, title, details, risk_level, responsible_party_role, deadline_id, task_id, created_at::text
       from blockers
       where transaction_id = $1
         and resolved_at is null
       order by created_at desc
       limit 20`,
      [transactionId]
    ),
    query<{
      summary: string;
      open_questions: unknown;
      known_context: unknown;
      last_inbound_at: string | null;
      updated_at: string;
    }>(
      `select summary, open_questions, known_context, last_inbound_at::text, updated_at::text
       from transaction_memory
       where transaction_id = $1`,
      [transactionId]
    ),
    query<{
      intent: string;
      action: string;
      confidence: string;
      policy_result: string;
      rationale: string;
      status: string;
      created_at: string;
    }>(
      `select intent, action, confidence::text, policy_result, rationale, status, created_at::text
       from agent_decisions
       where transaction_id = $1
       order by created_at desc
       limit 10`,
      [transactionId]
    ),
    query<{
      key: string;
      value: unknown;
      confidence: string;
      source_type: string;
      source_reference: string | null;
      needs_confirmation: boolean;
      updated_at: string;
    }>(
      `select
         key,
         value,
         confidence::text,
         source_type,
         source_reference,
         needs_confirmation,
         updated_at::text
       from transaction_facts
       where transaction_id = $1
       order by key`,
      [transactionId]
    ),
    query<{
      change_type: string;
      target_type: string;
      target_id: string | null;
      field_key: string;
      previous_value: unknown;
      new_value: unknown;
      source_type: string;
      source_reference: string | null;
      confidence: string;
      approval_status: string;
      created_at: string;
    }>(
      `select
         change_type,
         target_type,
         target_id,
         field_key,
         previous_value,
         new_value,
         source_type,
         source_reference,
         confidence::text,
         approval_status,
         created_at::text
       from transaction_change_events
       where transaction_id = $1
       order by created_at desc, id desc
       limit 20`,
      [transactionId]
    )
  ]);

  return {
    transaction: transaction.rows[0] ?? null,
    facts: facts.rows[0] ?? null,
    milestones: milestones.rows,
    tasks: tasks.rows,
    documents: documents.rows,
    messages: messages.rows,
    blockers: blockers.rows,
    memory: memory.rows[0] ?? null,
    recentDecisions: recentDecisions.rows,
    canonicalFacts: canonicalFacts.rows,
    recentChanges: recentChanges.rows
  };
}

export async function upsertTransactionMemory(input: {
  transactionId: string;
  summary: string;
  openQuestions?: unknown[];
  knownContext?: Record<string, unknown>;
  lastInboundAt?: Date;
}) {
  await query(
    `insert into transaction_memory (
       transaction_id,
       summary,
       open_questions,
       known_context,
       last_inbound_at
     )
     values ($1, $2, $3, $4, $5)
     on conflict (transaction_id) do update
       set summary = excluded.summary,
           open_questions = excluded.open_questions,
           known_context = transaction_memory.known_context || excluded.known_context,
           last_inbound_at = coalesce(excluded.last_inbound_at, transaction_memory.last_inbound_at),
           updated_at = now()`,
    [
      input.transactionId,
      input.summary,
      toJsonb(input.openQuestions ?? []),
      toJsonb(input.knownContext ?? {}),
      input.lastInboundAt ?? null
    ]
  );
}

export async function appendTransactionMemory(input: {
  transactionId: string;
  summary?: string;
  openQuestions?: string[];
  knownContext?: Record<string, unknown>;
  lastInboundAt?: Date;
}) {
  const current = await query<{
    summary: string;
    open_questions: unknown;
  }>(
    `select summary, open_questions
     from transaction_memory
     where transaction_id = $1`,
    [input.transactionId]
  );
  const currentRow = current.rows[0];
  const currentQuestions = Array.isArray(currentRow?.open_questions)
    ? currentRow.open_questions.filter((question): question is string => typeof question === "string")
    : [];
  const openQuestions = [...new Set([...currentQuestions, ...(input.openQuestions ?? [])])];
  const summary = [currentRow?.summary, input.summary]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");

  await upsertTransactionMemory({
    transactionId: input.transactionId,
    summary,
    openQuestions,
    knownContext: input.knownContext,
    lastInboundAt: input.lastInboundAt
  });
}

export async function createAgentDecision(input: {
  teamId: string;
  transactionId?: string;
  inboundMessageId?: string;
  inboundThreadId?: string;
  intent: string;
  action: string;
  confidence: number;
  matchConfidence?: number;
  requiresApproval: boolean;
  rationale: string;
  contextSummary?: Record<string, unknown>;
  toolPlan?: unknown;
}) {
  const result = await query<{ id: string }>(
    `insert into agent_decisions (
       team_id,
       transaction_id,
       inbound_message_id,
       inbound_thread_id,
       intent,
       action,
       confidence,
       match_confidence,
       requires_approval,
       rationale,
       context_summary,
       tool_plan
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      input.teamId,
      input.transactionId ?? null,
      input.inboundMessageId ?? null,
      input.inboundThreadId ?? null,
      input.intent,
      input.action,
      input.confidence,
      input.matchConfidence ?? null,
      input.requiresApproval,
      input.rationale,
      toJsonb(input.contextSummary ?? {}),
      toJsonb(input.toolPlan ?? [])
    ]
  );

  return result.rows[0];
}

export async function updateAgentDecisionExecution(input: {
  decisionId: string;
  policyResult: string;
  toolResults: unknown[];
  status: string;
}) {
  await query(
    `update agent_decisions
     set policy_result = $2,
         tool_results = $3,
         status = $4,
         executed_at = now()
     where id = $1`,
    [input.decisionId, input.policyResult, toJsonb(input.toolResults), input.status]
  );
}

export async function updateDocumentStatus(input: {
  id: string;
  status: string;
}) {
  await query(
    `update documents
     set status = $2
     where id = $1`,
    [input.id, input.status]
  );
}

export async function findAtRiskMilestones(daysAhead: number, today: string) {
  const result = await query<{
    transaction_id: string;
    team_id: string;
    property_address: string | null;
    milestone_id: string;
    title: string;
    due_date: string;
    risk_level: string;
    escalation_email: string;
    inbox_id: string;
  }>(
    `select
       t.id as transaction_id,
       t.team_id,
       t.property_address,
       m.id as milestone_id,
       m.title,
       m.due_date::text,
       m.risk_level,
       p.escalation_email,
       coalesce(p.agentmail_inbox_id, p.inbox_address) as inbox_id
     from milestones m
     join transactions t on t.id = m.transaction_id
     join tc_profiles p on p.id = t.tc_profile_id
     left join blockers b on b.deadline_id = m.id and b.resolved_at is null
     where m.completed_at is null
       and m.due_date is not null
       and m.due_date <= $2::date + ($1::int * interval '1 day')
       and t.status not in ('closed', 'terminated')
       and b.id is null`,
    [daysAhead, today]
  );

  return result.rows;
}

export async function findStaleResponseTasks(today: string) {
  const result = await query<{
    transaction_id: string;
    team_id: string;
    property_address: string | null;
    task_id: string;
    title: string;
    owner_role: string;
    due_date: string | null;
    follow_up_due_date: string;
    escalation_email: string;
    inbox_id: string;
  }>(
    `select
       t.id as transaction_id,
       t.team_id,
       t.property_address,
       task.id as task_id,
       task.title,
       task.owner_role,
       task.due_date::text,
       task.follow_up_due_date::text,
       p.escalation_email,
       coalesce(p.agentmail_inbox_id, p.inbox_address) as inbox_id
     from tasks task
     join transactions t on t.id = task.transaction_id
     join tc_profiles p on p.id = t.tc_profile_id
     left join blockers b on b.task_id = task.id and b.resolved_at is null
     where task.status = 'waiting_response'
       and task.follow_up_due_date is not null
       and task.follow_up_due_date <= $1::date
       and t.status not in ('closed', 'terminated')
       and b.id is null
     order by task.follow_up_due_date asc, task.created_at asc`,
    [today]
  );

  return result.rows;
}

export async function createBlocker(input: {
  transactionId: string;
  title: string;
  details: string;
  riskLevel: string;
  deadlineId?: string;
  taskId?: string;
}) {
  const result = await query<{ id: string }>(
    `insert into blockers (
       transaction_id,
       title,
       details,
       risk_level,
       deadline_id,
       task_id
     )
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      input.transactionId,
      input.title,
      input.details,
      input.riskLevel,
      input.deadlineId ?? null,
      input.taskId ?? null
    ]
  );

  return result.rows[0];
}

export async function upsertBlockerRecord(input: {
  transactionId: string;
  id?: string;
  title: string;
  details: string;
  riskLevel: string;
  responsiblePartyRole?: string;
  deadlineId?: string;
  taskId?: string;
  resolved?: boolean;
}) {
  const existing = await query<{ id: string }>(
    `select id
     from blockers
     where transaction_id = $1
       and (
         ($2::uuid is not null and id = $2::uuid) or
         ($3::text is not null and title = $3::text) or
         ($4::uuid is not null and task_id = $4::uuid and resolved_at is null)
       )
     order by created_at desc
     limit 1`,
    [input.transactionId, input.id ?? null, input.title, input.taskId ?? null]
  );

  if (existing.rows[0]) {
    const result = await query<{ id: string }>(
      `update blockers
       set title = $2,
           details = $3,
           risk_level = $4,
           responsible_party_role = coalesce($5, responsible_party_role),
           deadline_id = coalesce($6::uuid, deadline_id),
           task_id = coalesce($7::uuid, task_id),
           resolved_at = case when $8 then coalesce(resolved_at, now()) else resolved_at end
       where id = $1
       returning id`,
      [
        existing.rows[0].id,
        input.title,
        input.details,
        input.riskLevel,
        input.responsiblePartyRole ?? null,
        input.deadlineId ?? null,
        input.taskId ?? null,
        input.resolved ?? false
      ]
    );

    return { id: result.rows[0].id, inserted: false };
  }

  const result = await query<{ id: string }>(
    `insert into blockers (
       transaction_id,
       title,
       details,
       risk_level,
       responsible_party_role,
       deadline_id,
       task_id,
       resolved_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, case when $8 then now() else null end)
     returning id`,
    [
      input.transactionId,
      input.title,
      input.details,
      input.riskLevel,
      input.responsiblePartyRole ?? null,
      input.deadlineId ?? null,
      input.taskId ?? null,
      input.resolved ?? false
    ]
  );

  return { id: result.rows[0].id, inserted: true };
}

export async function createApproval(input: {
  transactionId: string;
  agentDecisionId?: string;
  taskId?: string;
  proposedSubject: string;
  proposedBody: string;
  proposedTo: string[];
  proposedCc: string[];
  expiresAt?: Date;
}) {
  const result = await query<{ id: string }>(
    `insert into approvals (
       transaction_id,
       agent_decision_id,
       task_id,
       proposed_subject,
       proposed_body,
       proposed_to,
       proposed_cc,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      input.transactionId,
      input.agentDecisionId ?? null,
      input.taskId ?? null,
      input.proposedSubject,
      input.proposedBody,
      input.proposedTo,
      input.proposedCc,
      input.expiresAt ?? null
    ]
  );

  return result.rows[0];
}

export interface ApprovalExecutionRow {
  id: string;
  transaction_id: string;
  team_id: string;
  agent_decision_id: string | null;
  task_id: string | null;
  proposed_subject: string;
  proposed_body: string;
  proposed_to: string[];
  proposed_cc: string[];
  inbox_id: string;
  escalation_email: string;
  request_message_id: string | null;
  request_thread_id: string | null;
}

const approvalExecutionSelect = `
  a.id,
  a.transaction_id,
  t.team_id,
  a.agent_decision_id,
  a.task_id,
  a.proposed_subject,
  a.proposed_body,
  a.proposed_to,
  a.proposed_cc,
  coalesce(p.agentmail_inbox_id, p.inbox_address) as inbox_id,
  p.escalation_email,
  a.request_message_id,
  a.request_thread_id
`;

export async function updateApprovalRequestMetadata(input: {
  id: string;
  requestMessageId?: string;
  requestThreadId?: string;
}) {
  await query(
    `update approvals
     set request_message_id = coalesce($2, request_message_id),
         request_thread_id = coalesce($3, request_thread_id),
         updated_at = now()
     where id = $1`,
    [
      input.id,
      input.requestMessageId ?? null,
      input.requestThreadId ?? null
    ]
  );
}

export async function updateApprovalDraft(input: {
  id: string;
  proposedSubject?: string;
  proposedBody: string;
  proposedTo?: string[];
  proposedCc?: string[];
}) {
  const result = await query<ApprovalExecutionRow>(
    `update approvals a
     set proposed_subject = coalesce($2, proposed_subject),
         proposed_body = $3,
         proposed_to = coalesce($4, proposed_to),
         proposed_cc = coalesce($5, proposed_cc),
         updated_at = now()
     from transactions t
     join tc_profiles p on p.id = t.tc_profile_id
     where a.id = $1
       and a.transaction_id = t.id
       and a.status = 'pending'
     returning ${approvalExecutionSelect}`,
    [
      input.id,
      input.proposedSubject ?? null,
      input.proposedBody,
      input.proposedTo ?? null,
      input.proposedCc ?? null
    ]
  );

  return result.rows[0] ?? null;
}

export async function findPendingApprovalByReply(input: {
  teamId: string;
  realtorEmail: string;
  threadId?: string;
  messageId?: string;
}) {
  if (!input.threadId && !input.messageId) {
    return null;
  }

  const result = await query<ApprovalExecutionRow>(
    `select ${approvalExecutionSelect}
     from approvals a
     join transactions t on t.id = a.transaction_id
     join tc_profiles p on p.id = t.tc_profile_id
     where t.team_id = $1
       and a.status = 'pending'
       and lower(p.escalation_email) = lower($2)
       and (
         ($3::text is not null and a.request_thread_id = $3::text) or
         ($4::text is not null and a.request_message_id = $4::text)
       )
     order by a.created_at desc
     limit 1`,
    [
      input.teamId,
      input.realtorEmail,
      input.threadId ?? null,
      input.messageId ?? null
    ]
  );

  return result.rows[0] ?? null;
}

export async function updateApprovalSentMetadata(input: {
  id: string;
  sentMessageId?: string;
  sentThreadId?: string;
}) {
  await query(
    `update approvals
     set sent_message_id = coalesce($2, sent_message_id),
         sent_thread_id = coalesce($3, sent_thread_id),
         updated_at = now()
     where id = $1`,
    [
      input.id,
      input.sentMessageId ?? null,
      input.sentThreadId ?? null
    ]
  );
}

export async function updateApprovalStatus(id: string, status: string) {
  const result = await query<ApprovalExecutionRow>(
    `update approvals a
     set status = $2,
         approved_at = case when $2 = 'approved' then coalesce(approved_at, now()) else approved_at end,
         rejected_at = case when $2 = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
         updated_at = now()
     from transactions t
     join tc_profiles p on p.id = t.tc_profile_id
     where a.id = $1
       and a.transaction_id = t.id
       and a.status = 'pending'
     returning ${approvalExecutionSelect}`,
    [id, status]
  );

  return result.rows[0] ?? null;
}

export async function getDashboardSnapshot(teamId: string) {
  const [transactions, blockers, approvals] = await Promise.all([
    query<{
      id: string;
      property_address: string | null;
      status: string;
      phase: string | null;
      current_risk: string;
      closing_date: string | null;
    }>(
      `select id, property_address, status, phase, current_risk, closing_date::text
       from transactions
       where team_id = $1
       order by updated_at desc
       limit 20`,
      [teamId]
    ),
    query<{
      id: string;
      transaction_id: string;
      title: string;
      risk_level: string;
      created_at: string;
    }>(
      `select b.id, b.transaction_id, b.title, b.risk_level, b.created_at::text
       from blockers b
       join transactions t on t.id = b.transaction_id
       where t.team_id = $1 and b.resolved_at is null
       order by b.created_at desc
       limit 20`,
      [teamId]
    ),
    query<{
      id: string;
      transaction_id: string;
      proposed_subject: string;
      created_at: string;
    }>(
      `select a.id, a.transaction_id, a.proposed_subject, a.created_at::text
       from approvals a
       join transactions t on t.id = a.transaction_id
       where t.team_id = $1 and a.status = 'pending'
       order by a.created_at desc
       limit 20`,
      [teamId]
    )
  ]);

  return {
    transactions: transactions.rows,
    blockers: blockers.rows,
    approvals: approvals.rows
  };
}

export async function findLatestOpenTransaction(teamId: string) {
  const result = await query<{
    id: string;
    property_address: string | null;
    status: string;
    phase: string | null;
    current_risk: string;
    closing_date: string | null;
  }>(
    `select id, property_address, status, phase, current_risk, closing_date::text
     from transactions
     where team_id = $1
       and status not in ('closed', 'terminated')
     order by updated_at desc
     limit 1`,
    [teamId]
  );

  return result.rows[0] ?? null;
}

export async function getTransactionStatusSummary(transactionId: string) {
  const [transaction, nextMilestone, blockers] = await Promise.all([
    query<{
      id: string;
      property_address: string | null;
      status: string;
      phase: string | null;
      current_risk: string;
      closing_date: string | null;
    }>(
      `select id, property_address, status, phase, current_risk, closing_date::text
       from transactions
       where id = $1`,
      [transactionId]
    ),
    query<{
      title: string;
      due_date: string | null;
      source_reference: string | null;
      risk_level: string;
    }>(
      `select title, due_date::text, source_reference, risk_level
       from milestones
       where transaction_id = $1
         and completed_at is null
       order by due_date nulls last, risk_level desc
       limit 1`,
      [transactionId]
    ),
    query<{ title: string; risk_level: string }>(
      `select title, risk_level
       from blockers
       where transaction_id = $1
         and resolved_at is null
       order by created_at desc
       limit 5`,
      [transactionId]
    )
  ]);

  return {
    transaction: transaction.rows[0] ?? null,
    nextMilestone: nextMilestone.rows[0] ?? null,
    blockers: blockers.rows
  };
}

export async function getTransactionDetail(transactionId: string) {
  const [
    transaction,
    milestones,
    tasks,
    documents,
    messages,
    auditEvents,
    facts,
    memory,
    agentDecisions,
    approvals,
    activityEvents
  ] = await Promise.all([
      query<{
        id: string;
        team_id: string;
        property_address: string | null;
        status: string;
        phase: string | null;
        current_risk: string;
        effective_date: string | null;
        closing_date: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `select
           id,
           team_id,
           property_address,
           status,
           phase,
           current_risk,
           effective_date::text,
           closing_date::text,
           created_at::text,
           updated_at::text
         from transactions
         where id = $1`,
        [transactionId]
      ),
      query<{
        key: string;
        title: string;
        phase: string;
        due_date: string | null;
        source_reference: string | null;
        risk_level: string;
        completed_at: string | null;
        metadata: unknown;
      }>(
        `select key, title, phase, due_date::text, source_reference, risk_level, completed_at::text, metadata
         from milestones
         where transaction_id = $1
         order by due_date nulls last, title`,
        [transactionId]
      ),
      query<{
        id: string;
        title: string;
        owner_role: string;
        status: string;
        due_date: string | null;
        follow_up_due_date: string | null;
        metadata: unknown;
      }>(
        `select id, title, owner_role, status, due_date::text, follow_up_due_date::text, metadata
         from tasks
         where transaction_id = $1
         order by due_date nulls last, created_at`,
        [transactionId]
      ),
      query<{
        type: string;
        name: string;
        status: string;
        blob_key: string | null;
        owner_role: string | null;
        due_date: string | null;
        metadata: unknown;
        created_at: string;
      }>(
        `select type, name, status, blob_key, owner_role, due_date::text, metadata, created_at::text
         from documents
         where transaction_id = $1
         order by created_at desc`,
        [transactionId]
      ),
      query<{
        from_address: string;
        to_addresses: string[];
        subject: string;
        received_at: string | null;
        sent_at: string | null;
        summary: string | null;
      }>(
        `select from_address, to_addresses, subject, received_at::text, sent_at::text, summary
         from messages
         where transaction_id = $1
         order by coalesce(received_at, sent_at) desc nulls last`,
        [transactionId]
      ),
      query<{ actor: string; event_type: string; payload: unknown; created_at: string }>(
        `select actor, event_type, payload, created_at::text
         from audit_events
         where transaction_id = $1
         order by created_at desc
         limit 100`,
        [transactionId]
      ),
      query<{ contract_version: string; validation_status: string; facts: unknown; created_at: string }>(
        `select contract_version, validation_status, facts, created_at::text
         from extracted_contract_facts
         where transaction_id = $1
         order by created_at desc
         limit 1`,
        [transactionId]
      ),
      query<{
        summary: string;
        open_questions: unknown;
        known_context: unknown;
        last_inbound_at: string | null;
        updated_at: string;
      }>(
        `select summary, open_questions, known_context, last_inbound_at::text, updated_at::text
         from transaction_memory
         where transaction_id = $1`,
        [transactionId]
      ),
      query<{
        intent: string;
        action: string;
        confidence: string;
        match_confidence: string | null;
        requires_approval: boolean;
        policy_result: string;
        rationale: string;
        context_summary: unknown;
        tool_plan: unknown;
        tool_results: unknown;
        status: string;
        created_at: string;
        executed_at: string | null;
      }>(
        `select
           intent,
           action,
           confidence::text,
           match_confidence::text,
           requires_approval,
           policy_result,
           rationale,
           context_summary,
           tool_plan,
           tool_results,
           status,
           created_at::text,
           executed_at::text
         from agent_decisions
         where transaction_id = $1
         order by created_at desc
         limit 50`,
        [transactionId]
      ),
      query<{
        id: string;
        proposed_subject: string;
        status: string;
        created_at: string;
      }>(
        `select id, proposed_subject, status, created_at::text
         from approvals
         where transaction_id = $1
         order by created_at desc
         limit 50`,
        [transactionId]
      ),
      query<{
        id: string;
        team_id: string;
        transaction_id: string | null;
        agent_decision_id: string | null;
        source_type: AgentActivityEvent["sourceType"];
        event_type: string;
        title: string;
        summary: string;
        status: AgentActivityEvent["status"];
        metadata: unknown;
        occurred_at: string;
      }>(
        `select
           id,
           team_id,
           transaction_id,
           agent_decision_id,
           source_type,
           event_type,
           title,
           summary,
           status,
           metadata,
           occurred_at::text
         from agent_activity_events
         where transaction_id = $1
         order by occurred_at, id`,
        [transactionId]
      )
    ]);

  const syntheticActivity = mapLegacyRecordsToActivity({
    messages: messages.rows,
    documents: documents.rows,
    agentDecisions: agentDecisions.rows,
    approvals: approvals.rows,
    auditEvents: auditEvents.rows
  });
  const activityTimeline = sortActivityTimeline(
    [...activityEvents.rows.map(toActivityEvent), ...syntheticActivity],
    "newest_first"
  );

  return {
    transaction: transaction.rows[0] ?? null,
    milestones: milestones.rows,
    tasks: tasks.rows,
    documents: documents.rows,
    messages: messages.rows,
    auditEvents: auditEvents.rows,
    facts: facts.rows[0] ?? null,
    memory: memory.rows[0] ?? null,
    agentDecisions: agentDecisions.rows,
    approvals: approvals.rows,
    activityTimeline
  };
}
