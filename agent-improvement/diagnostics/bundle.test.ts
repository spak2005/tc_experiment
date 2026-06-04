import { describe, expect, it } from "vitest";
import type { DiagnosticsSourceRecords } from "@/lib/db/repositories";
import { buildDiagnosticsBundle } from "./bundle";

const source: DiagnosticsSourceRecords = {
  run: {
    id: "run-1",
    userId: "user-1",
    transactionId: "tx-1",
    workflowType: "inbound_email",
    title: "Inbound email",
    summary: "Processing inbound email.",
    status: "completed",
    metadata: {
      messageId: "message-1",
      threadId: "thread-1",
      rawLargeValue: "not exposed"
    },
    startedAt: "2026-06-04T00:00:00.000Z",
    completedAt: "2026-06-04T00:02:00.000Z"
  },
  events: [
    {
      id: "event-1",
      userId: "user-1",
      transactionId: "tx-1",
      activityRunId: "run-1",
      sourceType: "extraction",
      eventType: "contract_extraction_completed",
      title: "Extracted contract facts",
      summary: "Extracted facts.",
      status: "completed",
      metadata: {
        filename: "contract.pdf",
        extractionMode: "anthropic_pdf_file",
        extractedFacts: {
          closingDate: {
            value: "2026-04-01"
          }
        },
        rawLargeValue: "not exposed"
      },
      occurredAt: "2026-06-04T00:02:00.000Z"
    }
  ],
  related: {
    transactions: [
      {
        id: "tx-1",
        property_address: "100 Pecanwood South",
        status: "active",
        phase: "opening_file",
        current_risk: "normal"
      }
    ],
    messages: [
      {
        id: "message-row-1",
        agentmail_message_id: "message-1",
        thread_id: "thread-1",
        subject: "Contract"
      }
    ],
    documents: [],
    milestones: [],
    tasks: [],
    blockers: [],
    approvals: [
      {
        id: "approval-1",
        proposed_subject: "Title intro",
        proposed_body: "Full approval body"
      }
    ],
    extractedContractFacts: [
      {
        id: "facts-1",
        transaction_id: "tx-1",
        contract_version: "TREC_20_18",
        validation_status: "ready_for_review",
        facts: {
          closingDate: {
            value: "2026-04-01"
          }
        }
      }
    ],
    transactionFacts: [],
    transactionChangeEvents: [],
    transactionMemory: [],
    agentDecisions: [
      {
        id: "decision-1",
        intent: "new_contract",
        action: "process_contract",
        rationale: "Contract is usable.",
        context_summary: {
          long: "raw"
        }
      }
    ],
    agentWakeups: [],
    auditEvents: [],
    webhookEvents: [
      {
        id: "webhook-1",
        payload: {
          raw: true
        }
      }
    ],
    outboundEmailActions: [
      {
        id: "email-action-1",
        text_body: "Full email body",
        provider_message_id: "provider-message-1"
      }
    ],
    calendarFeeds: []
  }
};

describe("buildDiagnosticsBundle", () => {
  it("builds compact summary diagnostics by default shape", () => {
    const bundle = buildDiagnosticsBundle({
      source,
      userId: "user-1",
      depth: "summary",
      generatedAt: "2026-06-04T00:03:00.000Z"
    });

    expect(bundle.schemaVersion).toBe("agent-diagnostics.v1");
    expect(bundle.trigger.kind).toBe("inbound_email");
    expect(bundle.events[0].metadata).toEqual({
      extractionMode: "anthropic_pdf_file",
      filename: "contract.pdf"
    });
    expect(bundle.relatedRecords).toMatchObject({
      counts: {
        approvals: 1,
        webhookEvents: 1
      },
      extraction: [
        {
          extractedFacts: {
            closingDate: {
              value: "2026-04-01"
            }
          }
        }
      ]
    });
    expect(JSON.stringify(bundle)).not.toContain("Full email body");
    expect(JSON.stringify(bundle)).not.toContain("Full approval body");
  });

  it("adds related records at standard depth without raw bodies", () => {
    const bundle = buildDiagnosticsBundle({
      source,
      userId: "user-1",
      depth: "standard"
    });

    expect(bundle.relatedRecords.approvals).toEqual([
      {
        id: "approval-1",
        proposed_subject: "Title intro",
        proposed_bodyPreview: "Full approval body"
      }
    ]);
    expect(bundle.relatedRecords.webhookEvents).toEqual([
      {
        id: "webhook-1"
      }
    ]);
  });

  it("includes stored raw fields only at raw depth", () => {
    const bundle = buildDiagnosticsBundle({
      source,
      userId: "user-1",
      depth: "raw"
    });

    expect(bundle.events[0].metadata.rawLargeValue).toBe("not exposed");
    expect(bundle.relatedRecords.outboundEmailActions).toEqual([
      {
        id: "email-action-1",
        text_body: "Full email body",
        provider_message_id: "provider-message-1"
      }
    ]);
    expect(bundle.externalRefs.providerMessageIds).toEqual(["provider-message-1"]);
  });
});

