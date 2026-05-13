import type { AgentContextPack, AgentDecision, PolicyResult } from "@/lib/agent/types";

function normalizeEmail(value?: string) {
  return (value ?? "").toLowerCase().trim();
}

function responseRecipients(decision: AgentDecision, context: AgentContextPack) {
  return decision.response?.to ?? [context.tcProfile.escalationEmail];
}

export function evaluateActionPolicy(
  decision: AgentDecision,
  context: AgentContextPack
): PolicyResult {
  if (decision.action === "noop") {
    return { result: "allowed", reasons: ["No outbound or state-changing action requested."] };
  }

  if (decision.rationale.toLowerCase().includes("legal advice")) {
    return {
      result: "blocked",
      reasons: ["The decision rationale indicates possible legal advice."]
    };
  }

  if (decision.action === "draft_external_email") {
    return {
      result: "approval_required",
      reasons: ["External-party coordination requires realtor approval in V1."]
    };
  }

  const realtorEmail = normalizeEmail(context.tcProfile.escalationEmail);
  const recipients = responseRecipients(decision, context).map(normalizeEmail);
  const realtorOnly = recipients.length > 0 && recipients.every((email) => email === realtorEmail);

  if (!realtorOnly && decision.response) {
    return {
      result: "approval_required",
      reasons: ["Outbound email includes someone other than the realtor."]
    };
  }

  if (decision.requiresApproval) {
    return {
      result: "approval_required",
      reasons: ["The decision requested human approval."]
    };
  }

  return {
    result: "allowed",
    reasons: ["Action is within V1 auto-send policy."]
  };
}
