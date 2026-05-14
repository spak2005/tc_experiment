export const events = {
  agentMailInboundReceived: "agentmail/inbound.received",
  transactionIntakeStarted: "transaction/intake.started",
  transactionDeadlineCheck: "transaction/deadline.check",
  transactionStaleResponseCheck: "transaction/stale_response.check",
  agentWakeupsDispatch: "agent/wakeups.dispatch"
} as const;

export type InngestEventName = (typeof events)[keyof typeof events];
