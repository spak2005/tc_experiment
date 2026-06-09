import type { DiagnosticsBundle } from "./types";

function compactMetadata(metadata: Record<string, unknown>) {
  const output: string[] = [];
  for (const key of [
    "intent",
    "action",
    "policyResult",
    "policy",
    "status",
    "confidence",
    "matchConfidence",
    "filename",
    "improvementCaseRunId"
  ]) {
    const value = metadata[key];
    if (value !== undefined && value !== null && typeof value !== "object") {
      output.push(`${key}=${value}`);
    }
  }
  return output.length > 0 ? ` (${output.join(", ")})` : "";
}

export function formatDiagnosticsTimeline(bundle: DiagnosticsBundle) {
  const lines = [
    `Run ${bundle.run.id}`,
    `Workflow: ${bundle.run.workflowType}`,
    `Status: ${bundle.run.status}`,
    `Trigger: ${bundle.trigger.label}`,
    ""
  ];

  for (const event of bundle.events) {
    lines.push(
      `${event.occurredAt} ${event.status.padEnd(9)} ${event.id} ${event.eventType}: ${event.title}${compactMetadata(event.metadata)}`
    );
  }

  return `${lines.join("\n")}\n`;
}

export function eventDrilldown(bundle: DiagnosticsBundle, eventId: string) {
  const event = bundle.events.find((candidate) => candidate.id === eventId);
  if (!event) return null;

  return {
    schemaVersion: bundle.schemaVersion,
    generatedAt: bundle.generatedAt,
    request: bundle.request,
    run: bundle.run,
    trigger: bundle.trigger,
    event,
    relatedRecords: bundle.relatedRecords,
    externalRefs: bundle.externalRefs
  };
}
