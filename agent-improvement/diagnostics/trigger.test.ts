import { describe, expect, it } from "vitest";
import type { AgentActivityRun } from "@/lib/agent/activity";
import { normalizeDiagnosticsTrigger } from "./trigger";

function run(input: Partial<AgentActivityRun>): AgentActivityRun {
  return {
    id: "run-1",
    userId: "user-1",
    workflowType: "unknown",
    title: "Run",
    summary: "",
    status: "started",
    metadata: {},
    startedAt: "2026-06-04T00:00:00.000Z",
    ...input
  };
}

describe("normalizeDiagnosticsTrigger", () => {
  it("normalizes inbound email runs", () => {
    const trigger = normalizeDiagnosticsTrigger(
      run({
        workflowType: "inbound_email",
        metadata: {
          webhookEventId: "webhook-1",
          messageId: "message-1",
          threadId: "thread-1",
          inboxId: "inbox-1",
          from: "agent@example.com",
          subject: "Contract"
        }
      })
    );

    expect(trigger).toMatchObject({
      kind: "inbound_email",
      label: "Inbound email",
      identifiers: {
        webhookEventId: "webhook-1",
        messageId: "message-1",
        threadId: "thread-1",
        inboxId: "inbox-1"
      },
      details: {
        from: "agent@example.com",
        subject: "Contract"
      }
    });
  });

  it("normalizes wakeup runs", () => {
    const trigger = normalizeDiagnosticsTrigger(
      run({
        workflowType: "agent_wakeup",
        metadata: {
          wakeupId: "wakeup-1",
          taskId: "task-1",
          actionType: "task_follow_up",
          reason: "No response from title."
        }
      })
    );

    expect(trigger.kind).toBe("agent_wakeup");
    expect(trigger.identifiers).toEqual({
      wakeupId: "wakeup-1",
      taskId: "task-1"
    });
    expect(trigger.details.actionType).toBe("task_follow_up");
  });

  it("labels stale response deadline monitor runs", () => {
    const trigger = normalizeDiagnosticsTrigger(
      run({
        workflowType: "deadline_monitor",
        metadata: {
          kind: "stale_response",
          taskId: "task-1",
          followUpDueDate: "2026-06-04"
        }
      })
    );

    expect(trigger).toMatchObject({
      kind: "deadline_monitor",
      label: "Stale-response escalation",
      identifiers: {
        taskId: "task-1"
      }
    });
  });

  it("falls back for unknown workflows", () => {
    const trigger = normalizeDiagnosticsTrigger(
      run({
        workflowType: "custom_workflow",
        title: "Custom work"
      })
    );

    expect(trigger).toMatchObject({
      kind: "unknown",
      label: "Custom work",
      workflowType: "custom_workflow"
    });
  });
});

