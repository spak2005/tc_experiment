import type {
  AgentActivityEvent,
  AgentActivityRun
} from "@/lib/agent/activity";
import {
  getDiagnosticsSourceRecords,
  type DiagnosticsSourceRecords
} from "@/lib/db/repositories";
import type { DiagnosticsBundle, DiagnosticsDepth } from "./types";
import { normalizeDiagnosticsTrigger } from "./trigger";

type Row = Record<string, unknown>;

const rawRecordKeys = new Set([
  "context_summary",
  "facts",
  "html_body",
  "known_context",
  "metadata",
  "open_questions",
  "payload",
  "preconditions",
  "proposed_body",
  "text_body",
  "tool_plan",
  "tool_results"
]);

function shortText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function metadataSummary(metadata: Record<string, unknown>) {
  const summary: Record<string, unknown> = {};
  for (const key of [
    "action",
    "confidence",
    "contractVersion",
    "count",
    "extractionError",
    "extractionMode",
    "filename",
    "findings",
    "intent",
    "matchConfidence",
    "missingItems",
    "policyResult",
    "result",
    "riskLevel",
    "status",
    "subject",
    "to",
    "transactionWrites"
  ]) {
    if (metadata[key] !== undefined) summary[key] = metadata[key];
  }

  return summary;
}

function filterEvent(event: AgentActivityEvent, depth: DiagnosticsDepth): AgentActivityEvent {
  if (depth === "raw") return event;

  return {
    ...event,
    metadata: metadataSummary(event.metadata)
  };
}

function filterRun(run: AgentActivityRun, depth: DiagnosticsDepth): AgentActivityRun {
  if (depth === "raw") return run;

  return {
    ...run,
    metadata: metadataSummary(run.metadata)
  };
}

function publicRow(row: Row) {
  const output: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (rawRecordKeys.has(key)) {
      const preview = shortText(value);
      if (preview) output[`${key}Preview`] = preview;
      continue;
    }

    output[key] = value;
  }

  return output;
}

function compactRows(rows: Row[], keys: string[]) {
  return rows.map((row) => {
    const output: Row = {};
    for (const key of keys) {
      if (row[key] !== undefined) output[key] = row[key];
    }
    return output;
  });
}

function summaryRecords(source: DiagnosticsSourceRecords) {
  const eventsWithErrors = source.events
    .filter((event) => event.status === "failed" || event.metadata.extractionError)
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      sourceType: event.sourceType,
      title: event.title,
      status: event.status,
      occurredAt: event.occurredAt,
      extractionError: event.metadata.extractionError
    }));

  const extractionEvents = source.events
    .filter((event) => event.sourceType === "extraction")
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      status: event.status,
      occurredAt: event.occurredAt,
      extractionMode: event.metadata.extractionMode,
      contractVersion: event.metadata.contractVersion,
      missingItems: event.metadata.missingItems,
      findings: event.metadata.findings,
      extractedFacts: event.metadata.extractedFacts
    }));

  return {
    counts: Object.fromEntries(
      Object.entries(source.related).map(([key, rows]) => [key, rows.length])
    ),
    transactions: compactRows(source.related.transactions, [
      "id",
      "property_address",
      "status",
      "phase",
      "current_risk",
      "effective_date",
      "closing_date"
    ]),
    errors: eventsWithErrors,
    extraction: extractionEvents,
    decisions: compactRows(source.related.agentDecisions, [
      "id",
      "intent",
      "action",
      "confidence",
      "match_confidence",
      "requires_approval",
      "policy_result",
      "rationale",
      "status",
      "created_at",
      "executed_at"
    ]),
    latestContractFacts: compactRows(source.related.extractedContractFacts.slice(0, 1), [
      "id",
      "transaction_id",
      "contract_version",
      "validation_status",
      "created_at"
    ])
  };
}

function standardRecords(source: DiagnosticsSourceRecords) {
  return Object.fromEntries(
    Object.entries(source.related).map(([key, rows]) => [
      key,
      rows.map((row) => publicRow(row))
    ])
  );
}

function externalRefs(source: DiagnosticsSourceRecords) {
  const refs: Record<string, Set<string>> = {
    agentMailMessageIds: new Set(),
    agentMailThreadIds: new Set(),
    agentDecisionIds: new Set(),
    providerMessageIds: new Set(),
    providerThreadIds: new Set(),
    webhookEventIds: new Set()
  };

  const add = (key: keyof typeof refs, value: unknown) => {
    if (typeof value === "string" && value.length > 0) refs[key].add(value);
  };

  for (const event of source.events) {
    add("agentDecisionIds", event.agentDecisionId);
    add("webhookEventIds", event.metadata.webhookEventId);
    add("agentMailMessageIds", event.metadata.messageId);
    add("agentMailMessageIds", event.metadata.agentMailMessageId);
    add("agentMailThreadIds", event.metadata.threadId);
  }

  for (const message of source.related.messages) {
    add("agentMailMessageIds", message.agentmail_message_id);
    add("agentMailThreadIds", message.thread_id);
  }

  for (const action of source.related.outboundEmailActions) {
    add("providerMessageIds", action.provider_message_id);
    add("providerThreadIds", action.provider_thread_id);
  }

  return Object.fromEntries(
    Object.entries(refs).map(([key, values]) => [key, [...values]])
  );
}

export function buildDiagnosticsBundle(input: {
  source: DiagnosticsSourceRecords;
  userId: string;
  depth: DiagnosticsDepth;
  generatedAt?: string;
}): DiagnosticsBundle {
  const relatedRecords =
    input.depth === "summary"
      ? summaryRecords(input.source)
      : input.depth === "standard"
        ? standardRecords(input.source)
        : input.source.related;

  return {
    schemaVersion: "agent-diagnostics.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    request: {
      activityRunId: input.source.run.id,
      userId: input.userId,
      depth: input.depth
    },
    run: filterRun(input.source.run, input.depth),
    trigger: normalizeDiagnosticsTrigger(input.source.run),
    events: input.source.events.map((event) => filterEvent(event, input.depth)),
    relatedRecords,
    externalRefs: externalRefs(input.source)
  };
}

export async function getDiagnosticsBundle(input: {
  activityRunId: string;
  userId: string;
  depth: DiagnosticsDepth;
}) {
  const source = await getDiagnosticsSourceRecords({
    activityRunId: input.activityRunId,
    userId: input.userId
  });

  if (!source) return null;

  return buildDiagnosticsBundle({
    source,
    userId: input.userId,
    depth: input.depth
  });
}

