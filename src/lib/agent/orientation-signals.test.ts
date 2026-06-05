import { describe, expect, it } from "vitest";
import { buildIntakeOrientationSignals } from "@/lib/agent/orientation-signals";
import type { AgentContextPack } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";

function extracted(value: string | number | boolean | null, confidence = 0.95) {
  return {
    value,
    confidence,
    sourceReference: "test",
    evidence: "test",
    needsConfirmation: value === null
  };
}

function context(input?: Partial<AgentContextPack>): AgentContextPack {
  return {
    inbound: {
      eventId: "event-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      threadId: "thread-1",
      from: "agent@example.com",
      to: ["tc@example.com"],
      cc: [],
      subject: "Contract",
      text: "",
      html: "",
      attachments: []
    },
    emailText: "See attached.",
    temporalContext: {
      now: "2026-06-04T12:00:00-05:00",
      today: "2026-06-04",
      timezone: "America/Chicago",
      businessDay: true
    },
    tcProfile: {
      id: "tc-1",
      userId: "user-1",
      displayName: "Stephanie",
      inboxAddress: "stephanie@example.com",
      inboxId: "inbox-1",
      escalationEmail: "agent@example.com"
    },
    match: {
      confidence: 0,
      reasons: [],
      ambiguous: false,
      candidates: []
    },
    ...input
  };
}

function assessment(input: {
  effectiveDate?: string;
  closingDate?: string;
  usability?: DocumentAssessment["usability"];
  missingItems?: string[];
}): DocumentAssessment {
  return {
    documentId: "document-1",
    filename: "contract.pdf",
    kind: "executed_contract",
    usability: input.usability ?? "usable",
    extractionMode: "anthropic_pdf_file",
    facts: {
      contractVersion: "TREC_20_18",
      propertyAddress: extracted("100 Pecanwood South"),
      effectiveDate: input.effectiveDate ? extracted(input.effectiveDate) : undefined,
      closingDate: input.closingDate ? extracted(input.closingDate) : undefined,
      cashOrFinanced: extracted("financed"),
      earnestMoneyAmount: extracted("2900"),
      optionPeriodDays: extracted(7),
      titleCompany: extracted("McKnight Title"),
      addenda: [],
      contacts: [],
      expectedDocuments: [],
      signatureStatus: "appears_executed",
      missingRequiredFacts: []
    },
    validationStatus: "ready_for_review",
    missingItems: input.missingItems ?? [],
    intakeGaps: [],
    findings: [],
    signatureStatus: "appears_executed"
  };
}

describe("buildIntakeOrientationSignals", () => {
  it("surfaces historical temporal signals without deciding posture", () => {
    const signals = buildIntakeOrientationSignals({
      context: context({
        emailText: "This is a previous transaction for your records."
      }),
      documentAssessment: assessment({
        effectiveDate: "2026-03-09",
        closingDate: "2026-04-01"
      })
    });

    expect(signals).toMatchObject({
      today: "2026-06-04",
      effectiveDateOffsetDays: -87,
      closingDateOffsetDays: -64,
      keyContractDatesAllPast: true,
      emailSuggestsHistorical: true
    });
  });

  it("keeps active-looking contracts distinct from all-past packages", () => {
    const signals = buildIntakeOrientationSignals({
      context: context(),
      documentAssessment: assessment({
        effectiveDate: "2026-06-01",
        closingDate: "2026-06-30"
      })
    });

    expect(signals.keyContractDatesAllPast).toBe(false);
    expect(signals.effectiveDateOffsetDays).toBe(-3);
    expect(signals.closingDateOffsetDays).toBe(26);
  });
});

