import { z } from "zod";
import type { AgentContextPack, AgentDecision } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";

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
  response: z
    .object({
      subject: z.string().optional(),
      body: z.string(),
      to: z.array(z.string()).optional(),
      cc: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional()
    })
    .optional(),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      input: z.record(z.unknown())
    })
  )
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
    transactionContext: context.transactionContext
      ? {
          transaction: context.transactionContext.transaction,
          missingItems: context.transactionContext.missingItems,
          nextMilestone: context.transactionContext.nextMilestone,
          blockers: context.transactionContext.blockers,
          documents: context.transactionContext.documents,
          recentMessages: context.transactionContext.messages.slice(0, 5),
          memory: context.transactionContext.memory
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
      response: {
        body:
          "Hi there,\n\nI see this may relate to more than one active transaction. Which property or client should I attach this update to?\n\nBest,\nYour TC",
        labels: ["clarification", "ambiguous_transaction"]
      },
      toolCalls: []
    };
  }

  if (assessment) {
    const missing = assessment.missingItems.map((item) => `- ${item}`).join("\n");
    const finding = assessment.findings.join(" ");
    const transaction = context.transactionContext?.transaction;
    const property = String(transaction?.property_address ?? "this transaction");
    const effectiveDate = String(transaction?.effective_date ?? "Needs confirmation");
    const closingDate = String(transaction?.closing_date ?? "Needs confirmation");
    const milestones = context.transactionContext?.milestones
      .slice(0, 8)
      .map((milestone) => {
        const title = String(milestone.title ?? "Milestone");
        const due = milestone.due_date ? String(milestone.due_date) : "event-triggered";
        return `- ${title}: ${due}`;
      })
      .join("\n");

    return {
      intent: "new_contract",
      action: assessment.usability === "usable" ? "process_contract" : "ask_for_info",
      confidence: 0.75,
      transactionId: context.match.transactionId,
      matchConfidence: context.match.confidence,
      requiresApproval: false,
      rationale: `Document assessment completed. ${finding}`,
      response:
        assessment.usability === "usable"
          ? {
              subject: `Transaction map: ${property}`,
              body: `Hi there,\n\nI reviewed the contract and opened the file.\n\nProperty: ${property}\nEffective Date: ${effectiveDate}\nClosing Date: ${closingDate}\n\nKey milestones:\n${milestones || "- No milestones could be generated yet."}\n\nI will keep monitoring the timeline and will escalate if a deadline is at risk.\n\nBest,\nYour TC`,
              labels: ["transaction_map", assessment.validationStatus, assessment.extractionMode]
            }
          : {
              body: `Hi there,\n\nI received the contract document, but I need a little more before I can fully open and monitor the file.\n\n${finding}${missing ? `\n\nI still need:\n${missing}` : ""}\n\nOnce I have that, I can build the transaction map and start tracking the deadlines.\n\nBest,\nYour TC`,
              labels: ["intake", "missing_info", assessment.kind]
            },
      toolCalls: []
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
      toolCalls: []
    };
  }

  return {
    intent: context.inbound.attachments.length > 0 ? "document_delivery" : "unknown",
    action: context.inbound.attachments.length > 0 ? "ask_for_info" : "ask_for_info",
    confidence: 0.45,
    matchConfidence: context.match.confidence,
    requiresApproval: false,
    rationale: "Fallback decision used because no confident transaction context was available.",
    response: {
      body:
        "Hi there,\n\nI received your email, but I do not yet have enough clear transaction context to act on it. Please send the executed contract PDF or the property address this relates to, and I will attach it to the right file.\n\nBest,\nYour TC",
      labels: ["clarification", "missing_context"]
    },
    toolCalls: []
  };
}

const SYSTEM_PROMPT = `You are an autonomous Texas real estate transaction coordinator.
You decide the next operational action for the TC inbox.
Use the provided deal context and document assessment. Do not invent facts.
Do not provide legal advice or commit any party to changed contract terms.
For V1, emails to the realtor can be sent directly. Emails to external parties should require approval.
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

Output JSON:
{
  "intent": "new_contract" | "status_question" | "transaction_update" | "document_delivery" | "missing_info_response" | "deadline_issue" | "external_party_reply" | "unknown" | "noise",
  "action": "process_contract" | "answer_status" | "record_update" | "ask_for_info" | "ask_which_transaction" | "create_blocker" | "draft_external_email" | "escalate_to_realtor" | "noop",
  "confidence": number,
  "transactionId": string?,
  "matchConfidence": number?,
  "requiresApproval": boolean,
  "rationale": string,
  "response": { "subject"?: string, "body": string, "to"?: string[], "cc"?: string[], "labels"?: string[] }?,
  "toolCalls": [{ "name": string, "input": object }]
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
