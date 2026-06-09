import { describe, expect, it } from "vitest";
import type { DiagnosticsBundle } from "./types";
import { eventDrilldown, formatDiagnosticsTimeline } from "./timeline";

const bundle: DiagnosticsBundle = {
  schemaVersion: "agent-diagnostics.v1",
  generatedAt: "2026-06-09T12:00:00.000Z",
  request: {
    activityRunId: "run-1",
    userId: "user-1",
    depth: "summary"
  },
  run: {
    id: "run-1",
    userId: "user-1",
    workflowType: "inbound_email",
    title: "Inbound email",
    summary: "Processing inbound email.",
    status: "completed",
    metadata: {
      improvementCaseRunId: "case-run-1"
    },
    startedAt: "2026-06-09T12:00:00.000Z"
  },
  trigger: {
    kind: "inbound_email",
    label: "Inbound email",
    workflowType: "inbound_email",
    identifiers: {},
    details: {}
  },
  events: [
    {
      id: "event-1",
      userId: "user-1",
      activityRunId: "run-1",
      sourceType: "email",
      eventType: "inbound_email_received",
      title: "Received inbound email",
      summary: "Received email.",
      status: "received",
      metadata: {
        subject: "Executed contract",
        text_body: "Raw body should not appear",
        improvementCaseRunId: "case-run-1"
      },
      occurredAt: "2026-06-09T12:00:01.000Z"
    }
  ],
  relatedRecords: {
    counts: {
      messages: 1
    }
  },
  externalRefs: {}
};

describe("diagnostics timeline formatting", () => {
  it("formats a compact ordered timeline", () => {
    const timeline = formatDiagnosticsTimeline(bundle);

    expect(timeline).toContain("Run run-1");
    expect(timeline).toContain("event-1 inbound_email_received");
    expect(timeline).toContain("improvementCaseRunId=case-run-1");
    expect(timeline).not.toContain("Raw body should not appear");
  });

  it("returns a single event drilldown", () => {
    const drilldown = eventDrilldown(bundle, "event-1");

    expect(drilldown?.event.id).toBe("event-1");
    expect(drilldown?.relatedRecords).toEqual({
      counts: {
        messages: 1
      }
    });
  });

  it("returns null when an event is absent", () => {
    expect(eventDrilldown(bundle, "missing")).toBeNull();
  });
});
