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
}) {
  const result = await query<{ id: string }>(
    `insert into documents (
       transaction_id,
       type,
       name,
       status,
       blob_key,
       source_message_id
     )
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      input.transactionId,
      input.type,
      input.name,
      input.status,
      input.blobKey ?? null,
      input.sourceMessageId ?? null
    ]
  );

  return result.rows[0];
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
       coalesce(array_remove(array_agg(distinct lower(p.email)), null), '{}') as party_emails,
       coalesce(array_remove(array_agg(distinct lower(p.name)), null), '{}') as party_names,
       coalesce(array_remove(array_agg(distinct m.thread_id), null), '{}') as thread_ids,
       coalesce(array_remove(array_agg(distinct lower(m.subject)), null), '{}') as recent_subjects
     from transactions t
     left join parties p on p.transaction_id = t.id
     left join messages m on m.transaction_id = t.id
     where t.team_id = $1
       and t.status not in ('closed', 'terminated')
     group by t.id
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
    recentDecisions
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
      key: string;
      title: string;
      phase: string;
      due_date: string | null;
      source_reference: string | null;
      risk_level: string;
      completed_at: string | null;
    }>(
      `select key, title, phase, due_date::text, source_reference, risk_level, completed_at::text
       from milestones
       where transaction_id = $1
       order by due_date nulls last, title`,
      [transactionId]
    ),
    query<{ title: string; owner_role: string; status: string; due_date: string | null }>(
      `select title, owner_role, status, due_date::text
       from tasks
       where transaction_id = $1
       order by due_date nulls last, created_at`,
      [transactionId]
    ),
    query<{ type: string; name: string; status: string; blob_key: string | null; created_at: string }>(
      `select type, name, status, blob_key, created_at::text
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
      created_at: string;
    }>(
      `select id, title, details, risk_level, responsible_party_role, created_at::text
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
    recentDecisions: recentDecisions.rows
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
      input.openQuestions ?? [],
      input.knownContext ?? {},
      input.lastInboundAt ?? null
    ]
  );
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
  toolPlan?: unknown[];
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
      input.contextSummary ?? {},
      input.toolPlan ?? []
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
    [input.decisionId, input.policyResult, input.toolResults, input.status]
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

export async function findAtRiskMilestones(daysAhead = 2) {
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
     where m.completed_at is null
       and m.due_date is not null
       and m.due_date <= current_date + ($1::int * interval '1 day')
       and t.status not in ('closed', 'terminated')`,
    [daysAhead]
  );

  return result.rows;
}

export async function createBlocker(input: {
  transactionId: string;
  title: string;
  details: string;
  riskLevel: string;
  deadlineId?: string;
}) {
  const result = await query<{ id: string }>(
    `insert into blockers (
       transaction_id,
       title,
       details,
       risk_level,
       deadline_id
     )
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      input.transactionId,
      input.title,
      input.details,
      input.riskLevel,
      input.deadlineId ?? null
    ]
  );

  return result.rows[0];
}

export async function createApproval(input: {
  transactionId: string;
  proposedSubject: string;
  proposedBody: string;
  proposedTo: string[];
  proposedCc: string[];
  expiresAt?: Date;
}) {
  const result = await query<{ id: string }>(
    `insert into approvals (
       transaction_id,
       proposed_subject,
       proposed_body,
       proposed_to,
       proposed_cc,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      input.transactionId,
      input.proposedSubject,
      input.proposedBody,
      input.proposedTo,
      input.proposedCc,
      input.expiresAt ?? null
    ]
  );

  return result.rows[0];
}

export async function updateApprovalStatus(id: string, status: string) {
  const result = await query<{
    id: string;
    transaction_id: string;
    proposed_subject: string;
    proposed_body: string;
    proposed_to: string[];
    proposed_cc: string[];
    inbox_id: string;
  }>(
    `update approvals a
     set status = $2
     from transactions t
     join tc_profiles p on p.id = t.tc_profile_id
     where a.id = $1
       and a.transaction_id = t.id
       and a.status = 'pending'
     returning
       a.id,
       a.transaction_id,
       a.proposed_subject,
       a.proposed_body,
       a.proposed_to,
       a.proposed_cc,
       coalesce(p.agentmail_inbox_id, p.inbox_address) as inbox_id`,
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
  const [transaction, milestones, tasks, documents, messages, auditEvents, facts] =
    await Promise.all([
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
      }>(
        `select key, title, phase, due_date::text, source_reference, risk_level, completed_at::text
         from milestones
         where transaction_id = $1
         order by due_date nulls last, title`,
        [transactionId]
      ),
      query<{ title: string; owner_role: string; status: string; due_date: string | null }>(
        `select title, owner_role, status, due_date::text
         from tasks
         where transaction_id = $1
         order by due_date nulls last, created_at`,
        [transactionId]
      ),
      query<{ type: string; name: string; status: string; blob_key: string | null }>(
        `select type, name, status, blob_key
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
      )
    ]);

  return {
    transaction: transaction.rows[0] ?? null,
    milestones: milestones.rows,
    tasks: tasks.rows,
    documents: documents.rows,
    messages: messages.rows,
    auditEvents: auditEvents.rows,
    facts: facts.rows[0] ?? null
  };
}
