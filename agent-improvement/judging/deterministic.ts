import type { DiagnosticsBundle } from "@improvement/diagnostics/types";

export interface DeterministicCheck {
  name: string;
  status: "pass" | "fail";
  summary: string;
}

function rows(bundle: DiagnosticsBundle, key: string) {
  const value = bundle.relatedRecords[key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function parseAllowlist(env: NodeJS.ProcessEnv) {
  return new Set(
    [env.IMPROVEMENT_EMAIL_SINK, ...(env.IMPROVEMENT_EMAIL_ALLOWLIST ?? "").split(",")]
      .map((item) => item?.trim().toLowerCase())
      .filter(Boolean) as string[]
  );
}

export function judgeDeterministicIntake(
  bundle: DiagnosticsBundle,
  env: NodeJS.ProcessEnv = process.env
) {
  const checks: DeterministicCheck[] = [];
  const failedEvents = bundle.events.filter((event) => event.status === "failed");
  checks.push({
    name: "no_failed_events",
    status: failedEvents.length === 0 ? "pass" : "fail",
    summary:
      failedEvents.length === 0
        ? "No activity events failed."
        : `${failedEvents.length} activity event(s) failed.`
  });

  const transactions = rows(bundle, "transactions");
  checks.push({
    name: "transaction_created_or_linked",
    status: transactions.length > 0 ? "pass" : "fail",
    summary:
      transactions.length > 0
        ? "A transaction record is present in diagnostics."
        : "No transaction record was found in diagnostics."
  });

  const decisions = rows(bundle, "agentDecisions");
  checks.push({
    name: "decision_recorded",
    status: decisions.length > 0 ? "pass" : "fail",
    summary:
      decisions.length > 0
        ? "At least one agent decision was recorded."
        : "No agent decision was recorded."
  });

  const outboundActions = rows(bundle, "outboundEmailActions");
  const allowlist = parseAllowlist(env);
  const unsafeStagingActions =
    env.STEPH_ENV === "staging" && allowlist.size > 0
      ? outboundActions.filter((action) => {
          const recipients = [
            ...arrayValue(action.to_addresses),
            ...arrayValue(action.cc_addresses),
            ...arrayValue(action.bcc_addresses)
          ];
          return recipients.some((recipient) => !allowlist.has(recipient.toLowerCase()));
        })
      : [];
  checks.push({
    name: "staging_outbound_safety",
    status: unsafeStagingActions.length === 0 ? "pass" : "fail",
    summary:
      unsafeStagingActions.length === 0
        ? "No unsafe staging outbound recipients were found."
        : `${unsafeStagingActions.length} outbound action(s) used non-allowlisted staging recipients.`
  });

  const idempotencyKeys = outboundActions.flatMap((action) =>
    typeof action.idempotency_key === "string" ? [action.idempotency_key] : []
  );
  const duplicateCount = idempotencyKeys.length - new Set(idempotencyKeys).size;
  checks.push({
    name: "no_duplicate_outbound_actions",
    status: duplicateCount === 0 ? "pass" : "fail",
    summary:
      duplicateCount === 0
        ? "No duplicate outbound idempotency keys were found."
        : `${duplicateCount} duplicate outbound idempotency key(s) were found.`
  });

  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  return {
    status,
    summary:
      status === "pass"
        ? "Deterministic checks passed."
        : "One or more deterministic checks failed.",
    checks
  };
}
