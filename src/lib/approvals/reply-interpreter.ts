import { z } from "zod";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";

export type ApprovalReplyAction =
  | "approve_send"
  | "reject"
  | "revise_and_send"
  | "revise_only"
  | "needs_clarification";

export interface ApprovalReplyDecision {
  action: ApprovalReplyAction;
  confidence: number;
  rationale: string;
  revisedSubject?: string;
  revisedBody?: string;
  revisedTo?: string[];
  revisedCc?: string[];
  question?: string;
}

export interface ApprovalReplyInput {
  replyText: string;
  originalSubject: string;
  originalBody: string;
  originalTo: string[];
  originalCc: string[];
}

const approvalReplySchema = z.object({
  action: z.enum([
    "approve_send",
    "reject",
    "revise_and_send",
    "revise_only",
    "needs_clarification"
  ]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  revisedSubject: z.string().optional(),
  revisedBody: z.string().optional(),
  revisedTo: z.array(z.string()).optional(),
  revisedCc: z.array(z.string()).optional(),
  question: z.string().optional()
});

const SYSTEM_PROMPT = `You interpret a realtor's reply to a transaction coordinator approval request.
The coordinator drafted an external email. The realtor may approve, reject, request edits, or ask to see a revision.
Do not invent transaction facts. Preserve the intended recipients unless the realtor explicitly changes them.
If the realtor explicitly says to make edits and send, return revise_and_send with the revised draft.
If the realtor asks to see the revised draft, return revise_only with the revised draft.
If the reply is ambiguous, return needs_clarification with one short question.
Return only valid JSON.`;

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function replyLead(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const kept: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.startsWith(">") || /^on .+ wrote:$/i.test(line)) break;
    if (
      lower.startsWith("approve:") ||
      lower.startsWith("reject:") ||
      lower.startsWith("subject:") ||
      lower.startsWith("i drafted the email below") ||
      lower.startsWith("reply \"send\"")
    ) {
      break;
    }
    kept.push(line);
    if (kept.join(" ").length > 500) break;
  }

  if (kept.length === 0 && lines.some((line) => line.startsWith(">"))) {
    return "";
  }

  return kept.join(" ").trim() || text.trim();
}

export function interpretApprovalReplyFast(replyText: string): ApprovalReplyDecision | undefined {
  const lead = normalize(replyLead(replyText));

  if (!lead) {
    return {
      action: "needs_clarification",
      confidence: 0.8,
      rationale: "The approval reply did not include usable text.",
      question: "Did you want me to send this draft, hold it, or make changes?"
    };
  }

  if (/\b(do not send|don't send|dont send|hold off|hold it|do not send yet|don't send yet|cancel|reject)\b/.test(lead)) {
    return {
      action: "reject",
      confidence: 0.9,
      rationale: "The realtor clearly asked not to send the draft."
    };
  }

  if (
    /^(send|approved|approve|yes|yep|yeah|ok|okay|looks good|go ahead|fine by me|that works)[.! ]*$/.test(
      lead
    ) ||
    /^(yes|yep|yeah|ok|okay|looks good|go ahead|fine by me|that works).*\b(send|go ahead)\b/.test(
      lead
    )
  ) {
    return {
      action: "approve_send",
      confidence: 0.92,
      rationale: "The realtor clearly approved sending the draft."
    };
  }

  const asksForEdit = /\b(change|edit|revise|update|make|add|remove|replace|say|mention)\b/.test(lead);
  if (asksForEdit) {
    const wantsToSee =
      /\b(let me see|send it back|send back|show me|for review|before sending|don't send yet|do not send yet)\b/.test(
        lead
      );
    const wantsSend =
      /\b(then send|and send|send it after|send after|then go ahead|make .* send|change .* send)\b/.test(
        lead
      );

    return {
      action: wantsSend && !wantsToSee ? "revise_and_send" : "revise_only",
      confidence: wantsSend || wantsToSee ? 0.8 : 0.65,
      rationale: wantsSend
        ? "The realtor requested edits and explicitly authorized sending afterward."
        : wantsToSee
          ? "The realtor requested edits and asked to review the revision."
          : "The realtor requested edits, but did not clearly authorize sending afterward."
    };
  }

  return undefined;
}

export async function classifyApprovalReply(
  input: ApprovalReplyInput
): Promise<ApprovalReplyDecision> {
  const fast = interpretApprovalReplyFast(input.replyText);

  if (fast?.action === "approve_send" || fast?.action === "reject" || fast?.action === "needs_clarification") {
    return fast;
  }

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 1800,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Classify this approval reply and revise the draft if edits are requested.

Output JSON:
{
  "action": "approve_send" | "reject" | "revise_and_send" | "revise_only" | "needs_clarification",
  "confidence": number,
  "rationale": string,
  "revisedSubject": "optional revised subject",
  "revisedBody": "optional revised body",
  "revisedTo": ["optional recipients"],
  "revisedCc": ["optional cc"],
  "question": "optional clarification question"
}

Realtor reply:
${input.replyText}

Original draft:
To: ${input.originalTo.join(", ")}
Cc: ${input.originalCc.join(", ")}
Subject: ${input.originalSubject}

${input.originalBody}`
            }
          ]
        }
      ]
    });
    const parsed = approvalReplySchema.parse(parseJsonObject(getFirstTextBlock(response.content)));

    if (
      (parsed.action === "revise_and_send" || parsed.action === "revise_only") &&
      !parsed.revisedBody
    ) {
      return {
        action: "needs_clarification",
        confidence: 0.4,
        rationale: "The reply requested edits, but the revised draft could not be produced.",
        question: "I can make that edit. Should I send it after revising, or send it back to you first?"
      };
    }

    return parsed;
  } catch {
    if (fast) {
      return {
        action: "needs_clarification",
        confidence: fast.confidence,
        rationale: "The reply appears to request edits, but the revision step failed.",
        question: "I can make that edit. Should I send it after revising, or send it back to you first?"
      };
    }

    return {
      action: "needs_clarification",
      confidence: 0.35,
      rationale: "The approval reply could not be classified confidently.",
      question: "Did you want me to send this draft, hold it, or make changes?"
    };
  }
}
