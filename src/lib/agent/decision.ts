import { z } from "zod";
import type { AgentContextPack, AgentDecision } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import { formatTemporalContextLine } from "@/lib/time/clock";
import { transactionWritesSchema } from "@/lib/transaction-writes/schemas";

const agentDecisionSchema = z.object({
  intent: z.enum([
    "new_contract",
    "status_question",
    "transaction_update",
    "document_delivery",
    "missing_info_response",
    "deadline_issue",
    "external_party_reply",
    "unknown",
    "noise"
  ]),
  action: z.enum([
    "process_contract",
    "answer_status",
    "record_update",
    "ask_for_info",
    "ask_which_transaction",
    "create_blocker",
    "draft_external_email",
    "escalate_to_realtor",
    "noop"
  ]),
  confidence: z.number().min(0).max(1),
  transactionId: z.string().optional(),
  matchConfidence: z.number().min(0).max(1).optional(),
  requiresApproval: z.boolean(),
  rationale: z.string(),
  inboundEvent: z.enum([
    "confirmation",
    "document_received",
    "question",
    "delay_or_blocker",
    "contact_update",
    "deadline_change",
    "approval_reply",
    "noise",
    "unknown"
  ]),
  response: z
    .object({
      subject: z.string().optional(),
      body: z.string(),
      to: z.array(z.string()).optional(),
      cc: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional(),
      taskId: z.string().uuid().optional()
    })
    .optional(),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      input: z.record(z.unknown())
    })
  ),
  transactionWrites: transactionWritesSchema
});

function compactContext(context: AgentContextPack, assessment?: DocumentAssessment) {
  return {
    inbound: {
      from: context.inbound.from,
      to: context.inbound.to,
      cc: context.inbound.cc,
      subject: context.inbound.subject,
      hasAttachments: context.inbound.attachments.length > 0,
      attachmentNames: context.inbound.attachments.map((attachment) => attachment.filename),
      text: context.emailText.slice(0, 4000)
    },
    tcProfile: {
      displayName: context.tcProfile.displayName,
      realtorEmail: context.tcProfile.escalationEmail
    },
    match: context.match,
    contractRouting: context.contractRouting,
    transactionContext: context.transactionContext
      ? {
          transaction: context.transactionContext.transaction,
          canonicalFacts: context.transactionContext.canonicalFacts,
          recentChanges: context.transactionContext.recentChanges.slice(0, 10),
          missingItems: context.transactionContext.missingItems,
          nextMilestone: context.transactionContext.nextMilestone,
          blockers: context.transactionContext.blockers,
          documents: context.transactionContext.documents,
          recentMessages: context.transactionContext.messages.slice(0, 5),
          dealMemory: context.transactionContext.dealMemory
        }
      : undefined,
    documentAssessment: assessment
      ? {
          kind: assessment.kind,
          usability: assessment.usability,
          validationStatus: assessment.validationStatus,
          missingItems: assessment.missingItems,
          findings: assessment.findings,
          signatureStatus: assessment.signatureStatus,
          extractionMode: assessment.extractionMode
        }
      : undefined
  };
}

function fallbackDecision(context: AgentContextPack, assessment?: DocumentAssessment): AgentDecision {
  if (context.match.ambiguous) {
    return {
      intent: "unknown",
      action: "ask_which_transaction",
      confidence: 0.65,
      matchConfidence: context.match.confidence,
      requiresApproval: false,
      rationale: "The inbound email could belong to more than one active transaction.",
      inboundEvent: "unknown",
      toolCalls: [],
      transactionWrites: []
    };
  }

  if (assessment) {
    const finding = assessment.findings.join(" ");

    return {
      intent: "new_contract",
      action: assessment.usability === "usable" ? "process_contract" : "ask_for_info",
      confidence: 0.75,
      transactionId: context.match.transactionId,
      matchConfidence: context.match.confidence,
      requiresApproval: false,
      rationale: `Document assessment completed. ${finding}`,
      inboundEvent: "document_received",
      toolCalls: [],
      transactionWrites: []
    };
  }

  if (context.match.transactionId) {
    return {
      intent: "status_question",
      action: "answer_status",
      confidence: 0.55,
      transactionId: context.match.transactionId,
      matchConfidence: context.match.confidence,
      requiresApproval: false,
      rationale: "Inbound email matched an active transaction without attachments.",
      inboundEvent: "question",
      toolCalls: [],
      transactionWrites: []
    };
  }

  return {
    intent: context.inbound.attachments.length > 0 ? "document_delivery" : "unknown",
    action: context.inbound.attachments.length > 0 ? "ask_for_info" : "ask_for_info",
    confidence: 0.45,
    matchConfidence: context.match.confidence,
    requiresApproval: false,
    rationale: "Fallback decision used because no confident transaction context was available.",
    inboundEvent: context.inbound.attachments.length > 0 ? "document_received" : "unknown",
    toolCalls: [],
    transactionWrites: []
  };
}

const SYSTEM_PROMPT = `You are an autonomous Texas real estate transaction coordinator.
You decide the next operational action for the TC inbox.
Use the provided deal context and document assessment. Do not invent facts.
Do not provide legal advice or commit any party to changed contract terms.
For V1, emails to the realtor can be sent directly. Emails to external parties should require approval.
Use transactionWrites for any structured update to the transaction file. Do not describe a database write only in prose.
Only use the listed transactionWrites tools. Never invent table names, SQL, or unsupported tools.
If no transaction is confidently identified, leave transactionWrites empty and ask for clarification.
High-impact changes such as termination, closed status, cancellation, or conflicting facts can be proposed, but the app may require approval.
Treat transactionContext.dealMemory as the current operating posture of the file. The structured transaction fields remain authoritative if they conflict with memory.
Do not use appendTransactionMemory to maintain the deal brief or general posture. Use it only for exceptional concise notes that are not captured by structured writes; the app refreshes the deal brief separately.
Classify the inbound email as exactly one inboundEvent:
- confirmation: a party confirms something is done or received.
- document_received: a document or attachment arrived or a party says they sent one.
- question: someone asks the TC or agent a question.
- delay_or_blocker: a party reports delay, missing info, denial, cancellation risk, or inability to proceed.
- contact_update: the email provides or corrects a stakeholder contact.
- deadline_change: the email changes a date, closing timeline, option/financing/appraisal deadline, or scheduled event.
- noise: the email is irrelevant to coordination.
- unknown: use only when the event cannot be classified.
For confirmation/document/contact/deadline/blocker events on a confident transaction, include transactionWrites that update tasks, documents, milestones, parties, blockers, facts, or memory.

If response.to includes anyone other than the realtor, you must set response.taskId to the id of the open task in transactionContext.tasks that this email is meant to progress. Match by owner role and topic. Do not invent task ids. If no matching task exists, leave response.taskId unset.

If you populate response.body, write like a person, not a document. The email is sent as plain text.
- No Markdown. No **bold**, no _italics_, no backticks, no # headings.
- No em-dashes (the "—" character). Use commas, colons, parentheses, or a new sentence instead.
- If a short list helps, use simple lines like "1. Item" or "- item" with no bolded labels.
- Use normal sentences.

Return only valid JSON matching the schema.`;

export async function decideNextAction(input: {
  context: AgentContextPack;
  documentAssessment?: DocumentAssessment;
}): Promise<AgentDecision> {
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
              text: `Choose the next action for this inbound TC email.

${formatTemporalContextLine(input.context.temporalContext)}

Output JSON:
{
  "intent": "new_contract" | "status_question" | "transaction_update" | "document_delivery" | "missing_info_response" | "deadline_issue" | "external_party_reply" | "unknown" | "noise",
  "action": "process_contract" | "answer_status" | "record_update" | "ask_for_info" | "ask_which_transaction" | "create_blocker" | "draft_external_email" | "escalate_to_realtor" | "noop",
  "confidence": number,
  "transactionId": string?,
  "matchConfidence": number?,
  "requiresApproval": boolean,
  "rationale": string,
  "inboundEvent": "confirmation" | "document_received" | "question" | "delay_or_blocker" | "contact_update" | "deadline_change" | "approval_reply" | "noise" | "unknown",
  "response": { "subject"?: string, "body": string, "to"?: string[], "cc"?: string[], "labels"?: string[], "taskId"?: string }?,
  "toolCalls": [{ "name": string, "input": object }],
  "transactionWrites": [
    {
      "name": "updateTransactionCore" | "upsertTransactionFact" | "upsertParties" | "upsertMilestones" | "updateTasks" | "updateDocuments" | "upsertBlocker" | "appendTransactionMemory",
      "input": { "transactionId": "uuid", "...": "tool-specific fields" },
      "source": {
        "sourceType": "contract_extraction" | "email" | "agent" | "system" | "manual",
        "sourceReference": "message/thread/document reference",
        "confidence": number,
        "rationale": "why this write is grounded"
      }
    }
  ]
}

Context:
${JSON.stringify(compactContext(input.context, input.documentAssessment), null, 2)}`
            }
          ]
        }
      ]
    });
    const text = getFirstTextBlock(response.content);
    const parsed = parseJsonObject<unknown>(text);

    return agentDecisionSchema.parse(parsed);
  } catch {
    return fallbackDecision(input.context, input.documentAssessment);
  }
}
