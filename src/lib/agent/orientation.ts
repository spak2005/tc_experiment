import { z } from "zod";
import type { AgentContextPack } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import {
  buildIntakeOrientationSignals,
  type IntakeOrientationSignals
} from "@/lib/agent/orientation-signals";
import { getStringFact } from "@/lib/contracts/facts";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import { formatTemporalContextLine } from "@/lib/time/clock";
import type { ContractRoutingDecision } from "@/lib/workflow/contract-routing";

export const intakeOperationalPostures = [
  "active_coordination",
  "historical_or_closed",
  "informational_only",
  "ambiguous",
  "blocked",
  "noise"
] as const;

export const intakeOrientationActions = [
  "open_transaction",
  "update_transaction",
  "ask_realtor",
  "store_only",
  "noop"
] as const;

export type IntakeOperationalPosture = (typeof intakeOperationalPostures)[number];
export type IntakeOrientationAction = (typeof intakeOrientationActions)[number];
export type IntakeOrientationMode = "llm" | "fallback";

export interface IntakeOrientationResult {
  situation: string;
  posture: IntakeOperationalPosture;
  action: IntakeOrientationAction;
  shouldOpenActiveFile: boolean;
  shouldStartCoordination: boolean;
  nextAction: string;
  rationale: string;
  confidence: number;
  signals: IntakeOrientationSignals;
  mode: IntakeOrientationMode;
}

export const intakeOrientationSchema = z.object({
  situation: z.string().min(1),
  posture: z.enum(intakeOperationalPostures),
  action: z.enum(intakeOrientationActions),
  shouldOpenActiveFile: z.boolean(),
  shouldStartCoordination: z.boolean(),
  nextAction: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function actionForActiveRouting(contractRouting?: ContractRoutingDecision): IntakeOrientationAction {
  return contractRouting?.action === "update_transaction" ? "update_transaction" : "open_transaction";
}

function fallbackOrientation(input: {
  context: AgentContextPack;
  documentAssessment: DocumentAssessment;
  contractRouting?: ContractRoutingDecision;
  signals: IntakeOrientationSignals;
}): Omit<IntakeOrientationResult, "mode"> {
  if (input.documentAssessment.usability === "unusable") {
    return {
      situation: "The attachment is not usable enough to create active coordination work.",
      posture: "blocked",
      action: "ask_realtor",
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      nextAction: "Ask the realtor for a usable contract or clarification.",
      rationale: "Document assessment marked the contract unusable.",
      confidence: 0.82,
      signals: input.signals
    };
  }

  if (
    input.contractRouting?.action === "ask_for_identity" ||
    input.contractRouting?.action === "ask_which_transaction" ||
    input.context.match.ambiguous
  ) {
    return {
      situation: "The package cannot be tied to one transaction confidently.",
      posture: "ambiguous",
      action: "ask_realtor",
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      nextAction: "Ask the realtor to clarify which transaction this belongs to.",
      rationale: input.contractRouting?.reasons.join(" ") || "The inbound matched ambiguously.",
      confidence: Math.max(0.65, input.contractRouting?.confidence ?? input.context.match.confidence),
      signals: input.signals
    };
  }

  if (input.signals.emailSuggestsHistorical || input.signals.keyContractDatesAllPast) {
    return {
      situation: "The package appears to describe a transaction that is not live coordination work.",
      posture: "historical_or_closed",
      action: "ask_realtor",
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      nextAction: "Tell the realtor this appears to be from the past and ask whether they need anything else done.",
      rationale:
        "The email or extracted contract dates indicate the work may already be complete.",
      confidence: 0.8,
      signals: input.signals
    };
  }

  if (input.signals.emailSuggestsInformational) {
    return {
      situation: "The email appears informational and does not clearly request live coordination.",
      posture: "informational_only",
      action: "ask_realtor",
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      nextAction: "Ask whether the realtor wants Stephanie to open active coordination.",
      rationale: "The email language suggests this may be FYI or for reference.",
      confidence: 0.72,
      signals: input.signals
    };
  }

  return {
    situation: "The attachment appears to be a current transaction package that can be coordinated.",
    posture: "active_coordination",
    action: actionForActiveRouting(input.contractRouting),
    shouldOpenActiveFile: true,
    shouldStartCoordination: true,
    nextAction: "Open or update the transaction file and begin coordination.",
    rationale: "The contract is usable, has stable identity, and does not show non-active posture signals.",
    confidence: 0.78,
    signals: input.signals
  };
}

const SYSTEM_PROMPT = `You are Stephanie, an expert transaction coordinator.
Before any operational machinery creates transaction files, tasks, deadlines, wakeups, or emails, orient yourself like a human TC.

Your job in this step is not to calculate every deadline. Your job is to decide what kind of situation this inbound document represents and whether it is live coordination work.

Use the email text, document assessment, routing result, extracted dates, and current date.
Do not assume a valid contract package is active just because facts can be extracted.
Do not create urgency just because a date exists on paper.
If the situation is ambiguous, historical, informational, blocked, or noise, say so.
If the package appears active, say that active coordination can start.

Return only valid JSON.`;

async function orientWithLlm(input: {
  context: AgentContextPack;
  documentAssessment: DocumentAssessment;
  contractRouting?: ContractRoutingDecision;
  signals: IntakeOrientationSignals;
}) {
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
            text: `Orient this inbound contract before any active coordination state is created.

${formatTemporalContextLine(input.context.temporalContext)}

Output JSON:
{
  "situation": "plain-English read of what this is",
  "posture": "active_coordination" | "historical_or_closed" | "informational_only" | "ambiguous" | "blocked" | "noise",
  "action": "open_transaction" | "update_transaction" | "ask_realtor" | "store_only" | "noop",
  "shouldOpenActiveFile": boolean,
  "shouldStartCoordination": boolean,
  "nextAction": "next appropriate TC move",
  "rationale": "why this posture is right",
  "confidence": number
}

Email:
${compactText(input.context.emailText).slice(0, 3000)}

Document assessment:
${JSON.stringify(
  {
    kind: input.documentAssessment.kind,
    usability: input.documentAssessment.usability,
    validationStatus: input.documentAssessment.validationStatus,
    findings: input.documentAssessment.findings,
    missingItems: input.documentAssessment.missingItems,
    signatureStatus: input.documentAssessment.signatureStatus,
    extractedFacts: {
      propertyAddress: getStringFact(input.documentAssessment.facts.propertyAddress),
      effectiveDate: getStringFact(input.documentAssessment.facts.effectiveDate),
      closingDate: getStringFact(input.documentAssessment.facts.closingDate),
      buyerNames: getStringFact(input.documentAssessment.facts.buyerNames),
      sellerNames: getStringFact(input.documentAssessment.facts.sellerNames)
    }
  },
  null,
  2
)}

Routing:
${JSON.stringify(input.contractRouting, null, 2)}

Signals:
${JSON.stringify(input.signals, null, 2)}`
          }
        ]
      }
    ]
  });

  return intakeOrientationSchema.parse(parseJsonObject(getFirstTextBlock(response.content)));
}

function normalizeOrientation(input: {
  orientation: Omit<IntakeOrientationResult, "mode" | "signals">;
  fallback: Omit<IntakeOrientationResult, "mode">;
  signals: IntakeOrientationSignals;
}): Omit<IntakeOrientationResult, "mode"> {
  const shouldDeferActiveWork =
    input.signals.keyContractDatesAllPast ||
    input.signals.emailSuggestsHistorical ||
    input.signals.documentUsability === "unusable";

  if (shouldDeferActiveWork && input.orientation.shouldStartCoordination) {
    return {
      ...input.orientation,
      posture:
        input.signals.documentUsability === "unusable" ? "blocked" : "historical_or_closed",
      action: "ask_realtor",
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      nextAction:
        input.signals.documentUsability === "unusable"
          ? "Ask the realtor for a usable contract or clarification."
          : "Confirm whether anything else is needed before starting coordination.",
      rationale: `${input.orientation.rationale} Active coordination was deferred because the orientation signals indicate this may not be live work.`,
      confidence: Math.min(input.orientation.confidence, 0.8),
      signals: input.signals
    };
  }

  if (input.orientation.posture !== "active_coordination") {
    return {
      ...input.orientation,
      action:
        input.orientation.action === "open_transaction" ||
        input.orientation.action === "update_transaction"
          ? "ask_realtor"
          : input.orientation.action,
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      signals: input.signals
    };
  }

  return {
    ...input.orientation,
    signals: input.signals
  };
}

export async function orientContractIntake(input: {
  context: AgentContextPack;
  documentAssessment: DocumentAssessment;
  contractRouting?: ContractRoutingDecision;
}): Promise<IntakeOrientationResult> {
  const signals = buildIntakeOrientationSignals({
    context: input.context,
    documentAssessment: input.documentAssessment,
    contractRouting: input.contractRouting
  });
  const fallback = fallbackOrientation({ ...input, signals });

  try {
    const orientation = await orientWithLlm({ ...input, signals });
    return {
      ...normalizeOrientation({ orientation, fallback, signals }),
      mode: "llm"
    };
  } catch {
    return {
      ...fallback,
      mode: "fallback"
    };
  }
}

