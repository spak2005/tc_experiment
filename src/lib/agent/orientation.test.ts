import { describe, expect, it, vi } from "vitest";
import {
  intakeOrientationSchema,
  orientContractIntake
} from "@/lib/agent/orientation";
import type { AgentContextPack } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn(async () => {
        throw new Error("LLM unavailable");
      })
    }
  }),
  getAnthropicModel: () => "test-model"
}));

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
    missingItems: [],
    intakeGaps: [],
    findings: [],
    signatureStatus: "appears_executed"
  };
}

describe("intake orientation", () => {
  it("exports the planned orientation wire shape", () => {
    expect(
      intakeOrientationSchema.parse({
        situation: "Active deal.",
        posture: "active_coordination",
        action: "open_transaction",
        shouldOpenActiveFile: true,
        shouldStartCoordination: true,
        nextAction: "Open the file.",
        rationale: "The contract is current.",
        confidence: 0.8
      })
    ).toMatchObject({
      posture: "active_coordination",
      action: "open_transaction"
    });
  });

  it("falls back to asking the realtor for all-past contract packages", async () => {
    const orientation = await orientContractIntake({
      context: context({
        emailText: "This is a previous transaction for your records."
      }),
      documentAssessment: assessment({
        effectiveDate: "2026-03-09",
        closingDate: "2026-04-01"
      }),
      contractRouting: {
        action: "create_transaction",
        confidence: 0.8,
        reasons: ["stable identity"],
        stableIdentity: {
          normalizedPropertyAddress: "100 pecanwood south",
          buyerNames: ["paul smith"],
          sellerNames: ["henry kokoszka"]
        },
        candidates: []
      }
    });

    expect(orientation).toMatchObject({
      posture: "historical_or_closed",
      action: "ask_realtor",
      shouldOpenActiveFile: false,
      shouldStartCoordination: false,
      mode: "fallback"
    });
  });
});
