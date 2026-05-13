import { describe, expect, it } from "vitest";
import {
  mapLegacyDecisionToActivity,
  mapLegacyDocumentToActivity,
  mapLegacyMessageToActivity,
  mapLegacyRecordsToActivity
} from "@/lib/agent/activity-timeline";

describe("activity timeline legacy mappers", () => {
  it("maps inbound messages to readable activity without raw JSON summaries", () => {
    const event = mapLegacyMessageToActivity(
      {
        from_address: "agent@example.com",
        to_addresses: ["tc@example.com"],
        subject: "Executed contract",
        received_at: "2026-05-12T10:00:00Z",
        sent_at: null,
        summary: "Inbound email attached to transaction context."
      },
      0
    );

    expect(event).toMatchObject({
      sourceType: "email",
      eventType: "email_received",
      title: "Received email",
      status: "received",
      isSynthetic: true
    });
    expect(event?.summary).toBe('Received "Executed contract" from agent@example.com.');
    expect(event?.summary).not.toContain("{");
    expect(event?.metadata).toMatchObject({ subject: "Executed contract" });
  });

  it("maps document status to debugger status", () => {
    const event = mapLegacyDocumentToActivity(
      {
        type: "contract",
        name: "contract.pdf",
        status: "needs_correction",
        blob_key: "teams/team-1/contract.pdf",
        created_at: "2026-05-12T10:01:00Z"
      },
      0
    );

    expect(event).toMatchObject({
      sourceType: "document",
      status: "waiting",
      title: "Document recorded"
    });
    expect(event?.metadata).toMatchObject({ filename: "contract.pdf" });
  });

  it("maps decisions to intent/action events with raw metadata separate", () => {
    const event = mapLegacyDecisionToActivity(
      {
        intent: "new_contract",
        action: "ask_for_info",
        confidence: "0.750",
        match_confidence: "0.800",
        requires_approval: false,
        policy_result: "allowed",
        rationale: "The contract is missing the Effective Date.",
        context_summary: { hasTransactionContext: true },
        tool_plan: [],
        tool_results: [{ tool: "sendResponse", result: "sent" }],
        status: "executed",
        created_at: "2026-05-12T10:02:00Z",
        executed_at: "2026-05-12T10:03:00Z"
      },
      0
    );

    expect(event.title).toBe("Decided: new_contract -> ask_for_info");
    expect(event.summary).toBe("The contract is missing the Effective Date.");
    expect(event.status).toBe("completed");
    expect(event.metadata).toMatchObject({
      intent: "new_contract",
      action: "ask_for_info",
      policyResult: "allowed"
    });
  });

  it("combines legacy records into synthetic activity", () => {
    const events = mapLegacyRecordsToActivity({
      messages: [],
      documents: [],
      approvals: [],
      auditEvents: [
        {
          actor: "tc_agent",
          event_type: "contract_document_assessed",
          payload: { usability: "needs_clarification" },
          created_at: "2026-05-12T10:04:00Z"
        }
      ],
      agentDecisions: [
        {
          intent: "status_question",
          action: "answer_status",
          confidence: "0.900",
          match_confidence: "0.900",
          requires_approval: false,
          policy_result: "allowed",
          rationale: "The realtor asked for status.",
          context_summary: {},
          tool_plan: [],
          tool_results: [],
          status: "waiting_approval",
          created_at: "2026-05-12T10:05:00Z",
          executed_at: null
        }
      ]
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.isSynthetic)).toBe(true);
    expect(events.map((event) => event.debugSource)).toEqual([
      "agent_decision",
      "audit_event"
    ]);
  });
});
