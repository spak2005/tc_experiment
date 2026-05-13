import { z } from "zod";
import type { AgentContextPack, AgentDecision } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import { formatTemporalContextLine } from "@/lib/time/clock";

export interface AgentResponseDraft {
  subject?: string;
  body: string;
  to: string[];
  cc?: string[];
  labels: string[];
}

const responseSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional()
});

function compactResponseContext(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  documentAssessment?: DocumentAssessment;
  statusContext?: string;
}) {
  return {
    inbound: {
      from: input.context.inbound.from,
      subject: input.context.inbound.subject,
      text: input.context.emailText.slice(0, 4000),
      attachments: input.context.inbound.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType
      }))
    },
    tc: {
      displayName: input.context.tcProfile.displayName,
      realtorEmail: input.context.tcProfile.escalationEmail
    },
    decision: {
      intent: input.decision.intent,
      action: input.decision.action,
      rationale: input.decision.rationale,
      confidence: input.decision.confidence
    },
    match: input.context.match,
    contractRouting: input.context.contractRouting,
    transaction: input.context.transactionContext
      ? {
          facts: input.context.transactionContext.facts,
          transaction: input.context.transactionContext.transaction,
          missingItems: input.context.transactionContext.missingItems,
          nextMilestone: input.context.transactionContext.nextMilestone,
          blockers: input.context.transactionContext.blockers,
          recentMessages: input.context.transactionContext.messages.slice(0, 5),
          memory: input.context.transactionContext.memory
        }
      : undefined,
    documentAssessment: input.documentAssessment
      ? {
          kind: input.documentAssessment.kind,
          usability: input.documentAssessment.usability,
          missingItems: input.documentAssessment.missingItems,
          intakeGaps: input.documentAssessment.intakeGaps,
          findings: input.documentAssessment.findings,
          signatureStatus: input.documentAssessment.signatureStatus
        }
      : undefined,
    statusContext: input.statusContext
  };
}

const SYSTEM_PROMPT = `You write emails as a professional autonomous real estate transaction coordinator.
You are not a chatbot. You are the TC operating the file.

Response rules:
- Write a natural email for this exact situation, not a reusable template.
- Use the inbound email and deal context to decide what to acknowledge and what to ask for.
- State reality plainly: what you know, what is missing, what you can do next.
- Do not invent transaction facts, deadlines, parties, or document contents.
- Do not give legal advice or suggest changing contract terms.
- Keep the tone competent, warm, and concise.
- Sign as "Your TC".
- If you lack deal context, ask for the smallest useful identifier, such as property address, client name, or executed contract PDF.
- If a document is incomplete or unusable, explain what you observed and what you need next.
- If answering status, answer the actual question and include the next relevant deadline or blocker when known.

Write like a person, not a document. This email is sent as plain text.
- No Markdown. No **bold**, no _italics_, no backticks, no # headings.
- No em-dashes (the "—" character). Use commas, colons, parentheses, or a new sentence instead.
- If a short list helps, use simple lines like "1. Item" or "- item" with no bolded labels.
- Use normal sentences.

Return only valid JSON.`;

export async function composeAgentResponse(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  documentAssessment?: DocumentAssessment;
  statusContext?: string;
}): Promise<AgentResponseDraft | undefined> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1800,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Write the email response for the TC to send.

${formatTemporalContextLine(input.context.temporalContext)}

Output JSON:
{
  "subject": "optional subject",
  "body": "email body",
  "to": ["optional recipients"],
  "cc": ["optional cc recipients"],
  "labels": ["optional labels"]
}

Context:
${JSON.stringify(compactResponseContext(input), null, 2)}`
          }
        ]
      }
    ]
  });
  const text = getFirstTextBlock(response.content);
  const parsed = responseSchema.parse(parseJsonObject<unknown>(text));

  return {
    subject: parsed.subject,
    body: parsed.body,
    to: parsed.to ?? [input.context.tcProfile.escalationEmail],
    cc: parsed.cc,
    labels: parsed.labels ?? [input.decision.intent, input.decision.action]
  };
}
