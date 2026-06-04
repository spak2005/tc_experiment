import type {
  AgentActivityEvent,
  AgentActivityRun
} from "@/lib/agent/activity";

export const diagnosticsDepths = ["summary", "standard", "raw"] as const;

export type DiagnosticsDepth = (typeof diagnosticsDepths)[number];

export type DiagnosticsTriggerKind =
  | "inbound_email"
  | "approval_reply"
  | "agent_wakeup"
  | "deadline_monitor"
  | "legacy_activity"
  | "unknown";

export interface DiagnosticsTrigger {
  kind: DiagnosticsTriggerKind;
  label: string;
  workflowType: string;
  identifiers: Record<string, string>;
  details: Record<string, unknown>;
}

export interface DiagnosticsRequest {
  activityRunId: string;
  userId: string;
  depth: DiagnosticsDepth;
}

export interface DiagnosticsBundle {
  schemaVersion: "agent-diagnostics.v1";
  generatedAt: string;
  request: DiagnosticsRequest;
  run: AgentActivityRun;
  trigger: DiagnosticsTrigger;
  events: AgentActivityEvent[];
  relatedRecords: Record<string, unknown>;
  externalRefs: Record<string, unknown>;
}

