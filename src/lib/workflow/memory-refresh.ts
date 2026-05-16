import { z } from "zod";
import type { TransactionContext } from "@/lib/agent/types";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import { formatTemporalContextLine, getTemporalContext } from "@/lib/time/clock";
import {
  createAgentActivityEvent,
  upsertTransactionMemory
} from "@/lib/db/repositories";

const memoryRefreshSchema = z.object({
  dealBrief: z.string().min(1),
  activeQuestionsAndWarnings: z.array(z.string()).default([])
});

export interface MemoryRefreshResult {
  dealBrief: string;
  activeQuestionsAndWarnings: string[];
  mode: "llm" | "fallback";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function briefRecord(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = record[key];
      return typeof value === "undefined" || value === null ? [] : [[key, value]];
    })
  );
}

function compactMemoryRefreshContext(context: TransactionContext) {
  return {
    transaction: context.transaction,
    dealMemory: context.dealMemory,
    canonicalFacts: context.canonicalFacts,
    recentChanges: context.recentChanges.slice(0, 10),
    missingItems: context.missingItems,
    nextMilestone: context.nextMilestone,
    blockers: context.blockers,
    activeTasks: context.tasks
      .filter((task) => !["complete", "cancelled"].includes(String(task.status)))
      .slice(0, 12)
      .map((task) =>
        briefRecord(task, [
          "id",
          "title",
          "owner_role",
          "status",
          "due_date",
          "follow_up_due_date",
          "metadata"
        ])
      ),
    activeDocuments: context.documents
      .filter((document) => !["received", "approved", "not_applicable"].includes(String(document.status)))
      .slice(0, 12)
      .map((document) =>
        briefRecord(document, ["type", "name", "status", "owner_role", "due_date", "metadata"])
      ),
    recentMessages: context.messages.slice(0, 5),
    recentDecisions: context.recentDecisions.slice(0, 5)
  };
}

function fallbackRefresh(context: TransactionContext): Omit<MemoryRefreshResult, "mode"> {
  const transaction = context.transaction;
  const property = stringValue(transaction.property_address) ?? "address pending";
  const status = stringValue(transaction.status) ?? "unknown status";
  const phase = stringValue(transaction.phase) ?? "no phase";
  const risk = stringValue(transaction.current_risk) ?? "normal risk";
  const closing = stringValue(transaction.closing_date);
  const nextMilestoneTitle = stringValue(context.nextMilestone?.title);
  const nextMilestoneDue = stringValue(context.nextMilestone?.due_date);
  const activeBlockers = context.blockers
    .map((blocker) => stringValue(blocker.title))
    .filter((title): title is string => Boolean(title))
    .slice(0, 3);
  const waitingTasks = context.tasks
    .filter((task) => ["waiting_response", "blocked"].includes(String(task.status)))
    .map((task) => stringValue(task.title))
    .filter((title): title is string => Boolean(title))
    .slice(0, 3);
  const missingItems = context.missingItems.slice(0, 3);

  const sentences = [
    `This transaction for ${property} is ${status} in ${phase} with ${risk}.`,
    closing ? `Closing is currently ${closing}.` : undefined,
    nextMilestoneTitle
      ? `Next milestone: ${nextMilestoneTitle}${nextMilestoneDue ? ` due ${nextMilestoneDue}` : ""}.`
      : undefined,
    activeBlockers.length > 0
      ? `Active blockers: ${activeBlockers.join("; ")}.`
      : undefined,
    waitingTasks.length > 0
      ? `Current waiting or blocked work: ${waitingTasks.join("; ")}.`
      : undefined,
    missingItems.length > 0
      ? `Missing or uncertain items: ${missingItems.join("; ")}.`
      : undefined
  ].filter((sentence): sentence is string => Boolean(sentence));

  return {
    dealBrief: sentences.join(" "),
    activeQuestionsAndWarnings: [...new Set([...missingItems, ...activeBlockers.map((title) => `Resolve blocker: ${title}.`)])]
  };
}

const SYSTEM_PROMPT = `You refresh concise operating memory for an autonomous Texas real estate transaction coordinator.
The structured transaction file is authoritative. The memory is only a short posture summary for future prompts.

Rules:
- Rewrite the dealBrief. Do not append a diary entry.
- Keep the dealBrief concise, roughly 150 to 300 words or less.
- Include what matters now: phase, current focus, blockers, waiting items, key warnings, and what not to assume.
- Preserve uncertainty explicitly. Do not turn tentative information into confirmed fact.
- Remove resolved or stale questions.
- activeQuestionsAndWarnings must include only unresolved questions or cautions that affect the next action.
- Do not include full email history.

Return only valid JSON matching the requested shape.`;

async function refreshWithLlm(input: {
  context: TransactionContext;
  reason: string;
  sourceReference?: string;
}): Promise<Omit<MemoryRefreshResult, "mode">> {
  const temporalContext = getTemporalContext();
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1200,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Refresh transaction memory.

${formatTemporalContextLine(temporalContext)}

Reason: ${input.reason}
Source reference: ${input.sourceReference ?? "not provided"}

Output JSON:
{
  "dealBrief": "current operating brief",
  "activeQuestionsAndWarnings": ["active question or warning"]
}

Context:
${JSON.stringify(compactMemoryRefreshContext(input.context), null, 2)}`
          }
        ]
      }
    ]
  });
  const parsed = parseJsonObject<unknown>(getFirstTextBlock(response.content));
  return memoryRefreshSchema.parse(parsed);
}

export async function refreshTransactionMemory(input: {
  userId: string;
  transactionId: string;
  context: TransactionContext;
  reason: string;
  sourceReference?: string;
  lastInboundAt?: Date;
}): Promise<MemoryRefreshResult> {
  let result: MemoryRefreshResult;

  try {
    result = {
      ...(await refreshWithLlm({
        context: input.context,
        reason: input.reason,
        sourceReference: input.sourceReference
      })),
      mode: "llm"
    };
  } catch {
    result = {
      ...fallbackRefresh(input.context),
      mode: "fallback"
    };
  }

  await upsertTransactionMemory({
    transactionId: input.transactionId,
    summary: result.dealBrief,
    openQuestions: result.activeQuestionsAndWarnings,
    knownContext: {
      lastMemoryRefreshAt: new Date().toISOString(),
      lastMemoryRefreshReason: input.reason,
      lastMemoryRefreshSource: input.sourceReference ?? null,
      lastMemoryRefreshMode: result.mode
    },
    lastInboundAt: input.lastInboundAt
  });

  await createAgentActivityEvent({
    userId: input.userId,
    transactionId: input.transactionId,
    sourceType: "system",
    eventType: "transaction_memory_refreshed",
    title: "Refreshed transaction memory",
    summary: `Updated deal brief for ${input.reason}.`,
    status: "completed",
    metadata: {
      reason: input.reason,
      sourceReference: input.sourceReference,
      mode: result.mode,
      dealBriefLength: result.dealBrief.length,
      questionCount: result.activeQuestionsAndWarnings.length
    }
  });

  return result;
}
