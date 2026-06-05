import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import type { AgentContextPack } from "@/lib/agent/types";
import { getStringFact } from "@/lib/contracts/facts";
import { parseDateOnly } from "@/lib/milestones/date-rules";
import type { ContractRoutingDecision } from "@/lib/workflow/contract-routing";

export interface IntakeOrientationSignals {
  today: string;
  effectiveDate?: string;
  closingDate?: string;
  effectiveDateOffsetDays?: number;
  closingDateOffsetDays?: number;
  keyContractDatesAllPast: boolean;
  keyContractDatesAllFuture: boolean;
  emailSuggestsHistorical: boolean;
  emailSuggestsInformational: boolean;
  documentUsability: DocumentAssessment["usability"];
  missingItems: string[];
  routingAction?: ContractRoutingDecision["action"];
  routingConfidence?: number;
  matchedTransactionId?: string;
  matchConfidence: number;
  matchAmbiguous: boolean;
}

function daysBetween(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function includesPattern(text: string, pattern: RegExp) {
  return pattern.test(text.replace(/\s+/g, " "));
}

export function buildIntakeOrientationSignals(input: {
  context: AgentContextPack;
  documentAssessment: DocumentAssessment;
  contractRouting?: ContractRoutingDecision;
}): IntakeOrientationSignals {
  const today = input.context.temporalContext.today;
  const todayDate = parseDateOnly(today);
  const effectiveDate = getStringFact(input.documentAssessment.facts.effectiveDate);
  const closingDate = getStringFact(input.documentAssessment.facts.closingDate);
  const effective = parseDateOnly(effectiveDate);
  const closing = parseDateOnly(closingDate);
  const offsets = [effective, closing]
    .filter((date): date is Date => Boolean(date))
    .map((date) => daysBetween(date, todayDate ?? date));
  const emailText = input.context.emailText;

  return {
    today,
    effectiveDate: effectiveDate ?? undefined,
    closingDate: closingDate ?? undefined,
    effectiveDateOffsetDays:
      effective && todayDate ? daysBetween(effective, todayDate) : undefined,
    closingDateOffsetDays: closing && todayDate ? daysBetween(closing, todayDate) : undefined,
    keyContractDatesAllPast: offsets.length > 0 && offsets.every((offset) => offset < 0),
    keyContractDatesAllFuture: offsets.length > 0 && offsets.every((offset) => offset >= 0),
    emailSuggestsHistorical: includesPattern(
      emailText,
      /\b(previous|past|old|closed|already closed|for your records|archive|historical|prior transaction)\b/i
    ),
    emailSuggestsInformational: includesPattern(
      emailText,
      /\b(fyi|for your records|heads up|no action|just sharing|for reference)\b/i
    ),
    documentUsability: input.documentAssessment.usability,
    missingItems: input.documentAssessment.missingItems,
    routingAction: input.contractRouting?.action,
    routingConfidence: input.contractRouting?.confidence,
    matchedTransactionId: input.context.match.transactionId,
    matchConfidence: input.context.match.confidence,
    matchAmbiguous: input.context.match.ambiguous
  };
}

