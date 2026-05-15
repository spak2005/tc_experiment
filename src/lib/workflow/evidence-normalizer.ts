import type {
  EvidenceItem,
  EvidenceTrigger
} from "@/lib/workflow/evidence-types";

const negativePatterns = [
  /\bnot received\b/i,
  /\bnot have\b/i,
  /\bstill waiting\b/i,
  /\bmissing\b/i,
  /\bdelayed\b/i,
  /\bcannot confirm\b/i,
  /\bcan't confirm\b/i,
  /\bhas not\b/i,
  /\bhave not\b/i
];

const confirmationPatterns = [
  /\bwe have\b/i,
  /\breceived\b/i,
  /\bdelivered\b/i,
  /\bissued\b/i,
  /\bcomplete\b/i,
  /\bcompleted\b/i,
  /\bconfirmed\b/i
];

const contactPatterns = [
  /\bcontact\b/i,
  /\bemail\b/i,
  /\bphone\b/i,
  /\bescrow officer\b/i,
  /\bcloser\b/i
];

function hasPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function compactText(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isNegatedEvidence(text: string) {
  return hasPattern(text, negativePatterns);
}

export function normalizeEvidence(trigger: EvidenceTrigger): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const emailText = compactText([trigger.subject, trigger.emailText].filter(Boolean).join("\n\n"));

  if (trigger.type === "heartbeat") {
    return [];
  }

  if (emailText) {
    if (isNegatedEvidence(emailText)) {
      items.push({
        type: "negative_or_blocker",
        text: emailText,
        source: "email",
        confidence: 0.8,
        negated: true
      });
    } else if (hasPattern(emailText, confirmationPatterns)) {
      items.push({
        type: "party_confirmation",
        text: emailText,
        source: "email",
        confidence: 0.7
      });
    }

    if (hasPattern(emailText, contactPatterns) && /@/.test(emailText)) {
      items.push({
        type: "contact_update",
        text: emailText,
        source: "email",
        confidence: 0.65
      });
    }
  }

  for (const document of trigger.documents ?? []) {
    items.push({
      type: "document_received",
      text: document.filename,
      source: "document",
      documentId: document.documentId,
      filename: document.filename,
      confidence: 0.8
    });
  }

  return items;
}
