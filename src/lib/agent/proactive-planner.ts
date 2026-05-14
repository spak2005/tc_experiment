import { openingTitleEmail } from "@/lib/email/templates";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import { formatTemporalContextLine } from "@/lib/time/clock";
import type { TransactionWrite } from "@/lib/transaction-writes/schemas";
import type { ProactiveAgentContext, ProactiveParty } from "@/lib/agent/proactive-context";
import {
  proactiveDecisionSchema,
  type ProactiveDecision
} from "@/lib/agent/proactive-decision";

function compactProactiveContext(context: ProactiveAgentContext) {
  return {
    tcProfile: {
      displayName: context.tcProfile.displayName,
      realtorEmail: context.tcProfile.escalationEmail
    },
    transaction: context.transactionContext.transaction,
    missingItems: context.transactionContext.missingItems,
    nextMilestone: context.transactionContext.nextMilestone,
    milestones: context.transactionContext.milestones,
    tasks: context.transactionContext.tasks,
    documents: context.transactionContext.documents,
    blockers: context.transactionContext.blockers,
    parties: context.parties,
    memory: context.transactionContext.memory,
    recentDecisions: context.transactionContext.recentDecisions.slice(0, 5),
    recentMessages: context.transactionContext.messages.slice(0, 5)
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstPartyWithEmail(parties: ProactiveParty[], role?: string) {
  if (!role) return undefined;
  return parties.find((party) => party.role === role && party.email);
}

function recipientForTask(parties: ProactiveParty[], metadata: Record<string, unknown>) {
  const roles = [
    stringValue(metadata.recipientRole),
    ...arrayValue(metadata.recipientRoleCandidates)
  ].filter((role): role is string => typeof role === "string");

  for (const role of roles) {
    const party = firstPartyWithEmail(parties, role);
    if (party) return party;
  }

  return undefined;
}

function firstNotStartedProactiveTask(context: ProactiveAgentContext) {
  return context.transactionContext.tasks.find((task) => {
    const metadata = recordValue(task.metadata);
    return task.status === "not_started" && typeof metadata.outreachKind === "string";
  });
}

function missingContactDecision(input: {
  context: ProactiveAgentContext;
  task: Record<string, unknown>;
  requiredRoles: string[];
}): ProactiveDecision {
  const property =
    stringValue(input.context.transactionContext.transaction.property_address) ??
    "this transaction";
  const missingRoles = input.requiredRoles.join(", ");
  const taskId = stringValue(input.task.id);
  const taskTitle = stringValue(input.task.title) ?? "the next opening task";
  const writes: TransactionWrite[] = taskId
    ? [
        {
          name: "updateTasks",
          input: {
            transactionId: input.context.transactionId,
            tasks: [
              {
                id: taskId,
                status: "blocked",
                metadata: {
                  proactiveBlockedReason: `Missing contact for ${missingRoles}`
                }
              }
            ]
          },
          source: {
            sourceType: "system",
            sourceReference: "proactive_planner",
            confidence: 0.9,
            rationale: "The proactive planner could not start the task without a recipient contact."
          }
        }
      ]
    : [];

  return {
    action: "send_realtor_email",
    confidence: 0.82,
    rationale: `Cannot start "${taskTitle}" until the realtor provides ${missingRoles}.`,
    taskId,
    requiresApproval: false,
    response: {
      subject: `Contact needed: ${property}`,
      to: [input.context.tcProfile.escalationEmail],
      labels: ["proactive", "missing_contact"],
      body: `Hi there,\n\nI am ready to work on ${property}, but I need the ${missingRoles} contact before I can handle "${taskTitle}".\n\nPlease send the name and email when you have it, and I will pick this back up.\n\nBest,\n${input.context.tcProfile.displayName}`
    },
    transactionWrites: writes
  };
}

function missingStakeholdersDecision(
  context: ProactiveAgentContext,
  task: Record<string, unknown>
): ProactiveDecision {
  const property =
    stringValue(context.transactionContext.transaction.property_address) ?? "this transaction";
  const taskId = stringValue(task.id);
  const missingItems =
    context.transactionContext.missingItems.length > 0
      ? context.transactionContext.missingItems.map((item) => `- ${item}`).join("\n")
      : "- Any missing title, lender, opposite-agent, HOA, or vendor contacts you already have";

  return {
    action: "send_realtor_email",
    confidence: 0.78,
    rationale: "The next opening task is to collect missing stakeholder contacts from the realtor.",
    taskId,
    requiresApproval: false,
    response: {
      subject: `Contacts needed: ${property}`,
      to: [context.tcProfile.escalationEmail],
      labels: ["proactive", "missing_contacts"],
      body: `Hi there,\n\nI am organizing ${property} and need a few contact details before I can keep moving.\n\nPlease send what you have for:\n${missingItems}\n\nOnce I have those, I will continue opening the file and coordinating the next steps.\n\nBest,\n${context.tcProfile.displayName}`
    },
    transactionWrites: taskId
      ? [
          {
            name: "updateTasks",
            input: {
              transactionId: context.transactionId,
              tasks: [
                {
                  id: taskId,
                  status: "waiting_response"
                }
              ]
            },
            source: {
              sourceType: "system",
              sourceReference: "proactive_planner",
              confidence: 0.85,
              rationale: "The agent asked the realtor for missing stakeholder contacts."
            }
          }
        ]
      : []
  };
}

function openingTitleDecision(
  context: ProactiveAgentContext,
  task: Record<string, unknown>,
  party: ProactiveParty
): ProactiveDecision {
  const property =
    stringValue(context.transactionContext.transaction.property_address) ?? "this transaction";
  const email = openingTitleEmail({
    titleContactName: party.name ?? party.organization ?? undefined,
    propertyAddress: property,
    agentName: context.tcProfile.displayName
  });

  return {
    action: "draft_external_email",
    confidence: 0.86,
    rationale: "The title contact is known, so the opening title email should be drafted for realtor approval.",
    taskId: stringValue(task.id),
    requiresApproval: true,
    response: {
      subject: email.subject,
      body: email.text,
      to: [party.email as string],
      labels: ["proactive", "opening_title"]
    },
    transactionWrites: []
  };
}

function oppositeAgentDecision(
  context: ProactiveAgentContext,
  task: Record<string, unknown>,
  party: ProactiveParty
): ProactiveDecision {
  const property =
    stringValue(context.transactionContext.transaction.property_address) ?? "this transaction";

  return {
    action: "draft_external_email",
    confidence: 0.82,
    rationale: "The opposite agent contact is known, so the TC introduction should be drafted for realtor approval.",
    taskId: stringValue(task.id),
    requiresApproval: true,
    response: {
      subject: `Transaction coordination: ${property}`,
      to: [party.email as string],
      labels: ["proactive", "opposite_agent_intro"],
      body: `Hi ${party.name ?? "there"},\n\nI am coordinating the transaction for ${property}. I wanted to introduce myself and confirm the best contact for transaction coordination items on your side.\n\nPlease send any immediate notes, document needs, or timeline concerns when you have a chance.\n\nBest,\n${context.tcProfile.displayName}`
    },
    transactionWrites: []
  };
}

function fallbackProactiveDecision(context: ProactiveAgentContext): ProactiveDecision {
  const status = stringValue(context.transactionContext.transaction.status);
  if (status === "closed" || status === "terminated") {
    return {
      action: "noop",
      confidence: 0.95,
      rationale: `Transaction is ${status}; no proactive work should be started.`,
      requiresApproval: false,
      transactionWrites: []
    };
  }

  const task = firstNotStartedProactiveTask(context);
  if (!task) {
    return {
      action: "noop",
      confidence: 0.65,
      rationale: "No not_started proactive task is currently actionable.",
      requiresApproval: false,
      transactionWrites: []
    };
  }

  const metadata = recordValue(task.metadata);
  if (metadata.outreachKind === "missing_stakeholder_contacts") {
    return missingStakeholdersDecision(context, task);
  }

  const requiredRoles = arrayValue(metadata.requiredContactRoles);
  const missingRoles = requiredRoles.filter((role) => !firstPartyWithEmail(context.parties, role));
  if (missingRoles.length > 0) {
    return missingContactDecision({ context, task, requiredRoles: missingRoles });
  }

  const recipientRole = stringValue(metadata.recipientRole);
  const recipient = recipientForTask(context.parties, metadata);
  if (!recipient) {
    return missingContactDecision({
      context,
      task,
      requiredRoles: recipientRole ? [recipientRole] : ["required recipient"]
    });
  }

  if (metadata.outreachKind === "opening_title_email") {
    return openingTitleDecision(context, task, recipient);
  }

  if (metadata.outreachKind === "opposite_agent_intro") {
    return oppositeAgentDecision(context, task, recipient);
  }

  return {
    action: "noop",
    confidence: 0.55,
    rationale: "The first proactive task does not have a supported deterministic outreach kind.",
    requiresApproval: false,
    transactionWrites: []
  };
}

const SYSTEM_PROMPT = `You are an autonomous Texas real estate transaction coordinator reviewing one transaction without an inbound email.
Choose exactly one next useful action. Do not invent contacts, dates, or contract terms.
External-party emails must require realtor approval. Realtor-only emails may be sent directly.
Prefer starting the earliest not_started proactive task when it has the needed contact information.
If an external task lacks a contact, ask the realtor for that contact instead of drafting to the external party.
Use transactionWrites for state updates. Never describe state changes only in prose.
Do not provide legal advice or commit any party to changed contract terms.

If response.to includes anyone other than the realtor, set taskId to the matching open task id. Do not invent task ids.

If you populate response.body, write plain text:
- No Markdown.
- No em-dashes.
- Use short, normal sentences.

Return only valid JSON matching the schema.`;

export async function decideProactiveAction(input: {
  context: ProactiveAgentContext;
}): Promise<ProactiveDecision> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 2500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Review this transaction and choose one proactive action.

${formatTemporalContextLine(input.context.temporalContext)}

Output JSON:
{
  "action": "send_realtor_email" | "draft_external_email" | "apply_updates" | "schedule_wakeup" | "noop",
  "confidence": number,
  "rationale": string,
  "taskId": "uuid"?,
  "requiresApproval": boolean,
  "response": { "subject": string, "body": string, "to": string[], "cc"?: string[], "labels"?: string[] }?,
  "transactionWrites": [
    {
      "name": "updateTransactionCore" | "upsertTransactionFact" | "upsertParties" | "upsertMilestones" | "updateTasks" | "updateDocuments" | "upsertBlocker" | "appendTransactionMemory",
      "input": { "transactionId": "uuid", "...": "tool-specific fields" },
      "source": {
        "sourceType": "contract_extraction" | "email" | "agent" | "system" | "manual",
        "sourceReference": "message/thread/document/wakeup reference",
        "confidence": number,
        "rationale": "why this write is grounded"
      }
    }
  ],
  "nextWakeup": {
    "actionType": "transaction_dispatch" | "transaction_heartbeat" | "task_follow_up",
    "wakeAt": "ISO datetime",
    "reason": string,
    "taskId"?: "uuid",
    "dedupeKey"?: string,
    "payload"?: object,
    "preconditions"?: object
  }?
}

Context:
${JSON.stringify(compactProactiveContext(input.context), null, 2)}`
            }
          ]
        }
      ]
    });
    const text = getFirstTextBlock(response.content);
    const parsed = parseJsonObject<unknown>(text);

    return proactiveDecisionSchema.parse(parsed);
  } catch {
    return fallbackProactiveDecision(input.context);
  }
}
