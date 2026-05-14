import {
  createAgentActivityEvent,
  createAgentWakeup
} from "@/lib/db/repositories";
import type {
  AgentWakeup,
  AgentWakeupActionType
} from "@/lib/domain/types";

export function buildWakeupDedupeKey(input: {
  transactionId: string;
  actionType: AgentWakeupActionType;
  taskId?: string;
}) {
  return [input.transactionId, input.actionType, input.taskId ?? "transaction"].join(":");
}

export async function scheduleAgentWakeup(input: {
  teamId: string;
  transactionId: string;
  taskId?: string;
  actionType: AgentWakeupActionType;
  reason: string;
  wakeAt: string;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
  preconditions?: Record<string, unknown>;
}): Promise<AgentWakeup> {
  const wakeup = await createAgentWakeup({
    teamId: input.teamId,
    transactionId: input.transactionId,
    taskId: input.taskId,
    actionType: input.actionType,
    reason: input.reason,
    wakeAt: input.wakeAt,
    dedupeKey:
      input.dedupeKey ??
      buildWakeupDedupeKey({
        transactionId: input.transactionId,
        actionType: input.actionType,
        taskId: input.taskId
      }),
    payload: input.payload,
    preconditions: input.preconditions
  });

  await createAgentActivityEvent({
    teamId: input.teamId,
    transactionId: input.transactionId,
    sourceType: "system",
    eventType: "proactive_wakeup_scheduled",
    title: "Scheduled proactive wakeup",
    summary: `${input.actionType} scheduled for ${input.wakeAt}: ${input.reason}.`,
    status: "waiting",
    metadata: {
      wakeupId: wakeup.id,
      actionType: input.actionType,
      taskId: input.taskId,
      wakeAt: input.wakeAt,
      dedupeKey: wakeup.dedupeKey,
      reason: input.reason
    }
  });

  return wakeup;
}
