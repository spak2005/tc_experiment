import { describe, expect, it } from "vitest";
import type { DiagnosticsBundle } from "@improvement/diagnostics/types";
import { judgeDeterministicIntake } from "./deterministic";

function bundle(input: Partial<DiagnosticsBundle> = {}): DiagnosticsBundle {
  return {
    schemaVersion: "agent-diagnostics.v1",
    generatedAt: "2026-06-09T12:00:00.000Z",
    request: {
      activityRunId: "run-1",
      userId: "user-1",
      depth: "standard"
    },
    run: {
      id: "run-1",
      userId: "user-1",
      workflowType: "inbound_email",
      title: "Inbound email",
      summary: "",
      status: "completed",
      metadata: {},
      startedAt: "2026-06-09T12:00:00.000Z"
    },
    trigger: {
      kind: "inbound_email",
      label: "Inbound email",
      workflowType: "inbound_email",
      identifiers: {},
      details: {}
    },
    events: [],
    relatedRecords: {
      transactions: [{ id: "tx-1" }],
      agentDecisions: [{ id: "decision-1" }],
      outboundEmailActions: [
        {
          idempotency_key: "send-1",
          to_addresses: ["qa-sink@example.com"],
          cc_addresses: [],
          bcc_addresses: []
        }
      ]
    },
    externalRefs: {},
    ...input
  };
}

describe("deterministic intake judge", () => {
  it("passes when the basic transaction and safety checks pass", () => {
    const result = judgeDeterministicIntake(bundle(), {
      STEPH_ENV: "staging",
      IMPROVEMENT_EMAIL_SINK: "qa-sink@example.com"
    } as NodeJS.ProcessEnv);

    expect(result.status).toBe("pass");
    expect(result.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("fails when diagnostics show missing transaction state", () => {
    const result = judgeDeterministicIntake(
      bundle({
        relatedRecords: {
          transactions: [],
          agentDecisions: [{ id: "decision-1" }],
          outboundEmailActions: []
        }
      })
    );

    expect(result.status).toBe("fail");
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: "transaction_created_or_linked",
        status: "fail"
      })
    );
  });

  it("fails unsafe staging outbound recipients", () => {
    const result = judgeDeterministicIntake(
      bundle({
        relatedRecords: {
          transactions: [{ id: "tx-1" }],
          agentDecisions: [{ id: "decision-1" }],
          outboundEmailActions: [
            {
              idempotency_key: "send-1",
              to_addresses: ["real-title@example.com"],
              cc_addresses: [],
              bcc_addresses: []
            }
          ]
        }
      }),
      {
        STEPH_ENV: "staging",
        IMPROVEMENT_EMAIL_SINK: "qa-sink@example.com"
      } as NodeJS.ProcessEnv
    );

    expect(result.status).toBe("fail");
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: "staging_outbound_safety",
        status: "fail"
      })
    );
  });
});
