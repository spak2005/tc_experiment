import { extractContractFactsFromPdf } from "@/lib/contracts/anthropic-extract";
import { extractTexasContractFacts } from "@/lib/contracts/extract";
import type { ContractFacts } from "@/lib/contracts/facts";
import { getStringFact } from "@/lib/contracts/facts";
import { validateContractFacts } from "@/lib/contracts/validate";
import type { StoredAttachment } from "@/lib/documents/attachments";
import type { TemporalContext } from "@/lib/time/clock";

export type DocumentKind =
  | "executed_contract"
  | "incomplete_contract"
  | "blank_or_sample_contract"
  | "non_contract_pdf"
  | "unreadable_pdf";

export type DocumentUsability = "usable" | "needs_clarification" | "unusable";

export interface IntakeGap {
  key: string;
  label: string;
  whyItMatters: string;
}

export interface DocumentAssessment {
  documentId: string;
  filename: string;
  kind: DocumentKind;
  usability: DocumentUsability;
  extractionMode: "anthropic_pdf" | "email_fallback";
  facts: ContractFacts;
  validationStatus: string;
  missingItems: string[];
  intakeGaps: IntakeGap[];
  findings: string[];
  signatureStatus: ContractFacts["signatureStatus"];
}

const gapReasons: Record<string, string> = {
  "Confirm the Effective Date.":
    "The TC needs the Effective Date to calculate contract deadlines correctly.",
  "Confirm the Closing Date.":
    "The Closing Date anchors the closing prep timeline and final coordination.",
  "Confirm whether this is cash or financed.":
    "Financing changes lender, appraisal, and loan approval tracking.",
  "Confirm the earnest money amount.":
    "Earnest money must be tracked with title to avoid default risk.",
  "Confirm the option period length.":
    "The option period controls inspection and termination risk.",
  "Provide the title company or escrow officer.":
    "The TC needs title contact details to confirm receipt, escrow, title commitment, and closing logistics.",
  "Confirm the property address.":
    "The property address is the primary identifier for matching future emails to this transaction."
};

function buildIntakeGaps(missingItems: string[]) {
  return missingItems.map((item) => ({
    key: item.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    label: item,
    whyItMatters: gapReasons[item] ?? "The TC needs this to coordinate the transaction accurately."
  }));
}

function classifyDocument(input: {
  filename: string;
  facts: ContractFacts;
  missingItems: string[];
  extractionFailed: boolean;
}): Pick<DocumentAssessment, "kind" | "usability" | "findings"> {
  if (input.extractionFailed) {
    return {
      kind: "unreadable_pdf",
      usability: "unusable",
      findings: ["The PDF could not be reliably read by the extraction model."]
    };
  }

  const findings: string[] = [];
  const filename = input.filename.toLowerCase();
  const hasProperty = Boolean(getStringFact(input.facts.propertyAddress));
  const hasEffectiveDate = Boolean(getStringFact(input.facts.effectiveDate));
  const hasClosingDate = Boolean(getStringFact(input.facts.closingDate));
  const criticalMissing = input.missingItems.length;
  const looksLikeTrainingFile = /\b(sample|training|blank|template)\b/i.test(filename);

  if (input.facts.signatureStatus === "missing_signature") {
    findings.push("The contract appears to be missing one or more signatures.");
  }

  if (looksLikeTrainingFile || (!hasProperty && !hasEffectiveDate && !hasClosingDate && criticalMissing >= 5)) {
    return {
      kind: "blank_or_sample_contract",
      usability: "unusable",
      findings: [
        ...findings,
        "The document appears to be a blank, sample, training, or otherwise incomplete contract."
      ]
    };
  }

  if (criticalMissing > 0 || input.facts.signatureStatus !== "appears_executed") {
    return {
      kind: "incomplete_contract",
      usability: "needs_clarification",
      findings: [
        ...findings,
        "The document contains contract-like information, but some required opening facts need confirmation."
      ]
    };
  }

  return {
    kind: "executed_contract",
    usability: "usable",
    findings: ["The document appears usable for opening the transaction file."]
  };
}

export async function assessContractDocument(input: {
  attachment: Pick<StoredAttachment, "filename" | "body"> & Partial<StoredAttachment>;
  emailText: string;
  temporalContext?: TemporalContext;
}): Promise<DocumentAssessment> {
  let facts = extractTexasContractFacts(input.emailText);
  let extractionMode: DocumentAssessment["extractionMode"] = "email_fallback";
  let extractionFailed = false;

  try {
    facts = await extractContractFactsFromPdf({
      filename: input.attachment.filename,
      pdf: input.attachment.body,
      emailContext: input.emailText,
      temporalContext: input.temporalContext
    });
    extractionMode = "anthropic_pdf";
  } catch {
    extractionFailed = true;
  }

  const validation = validateContractFacts(facts);
  const missingItems = validation.requiredClarifications;
  const classification = classifyDocument({
    filename: input.attachment.filename,
    facts,
    missingItems,
    extractionFailed
  });

  return {
    documentId: input.attachment.documentId ?? "",
    filename: input.attachment.filename,
    ...classification,
    extractionMode,
    facts,
    validationStatus: validation.status,
    missingItems,
    intakeGaps: buildIntakeGaps(missingItems),
    signatureStatus: facts.signatureStatus
  };
}

export function buildMissingInfoContext(assessment: Pick<DocumentAssessment, "missingItems" | "intakeGaps" | "findings" | "usability">) {
  return {
    usability: assessment.usability,
    findings: assessment.findings,
    missingItems: assessment.missingItems,
    gaps: assessment.intakeGaps
  };
}
