import {
  cancelPendingAgentWakeups,
  createAgentActivityEvent,
  createAgentWakeup
} from "@/lib/db/repositories";
import type {
  AgentWakeup,
  AgentWakeupActionType
} from "@/lib/domain/types";
import type { ProactiveAgentContext } from "@/lib/agent/proactive-context";
import { addDays, parseDateOnly } from "@/lib/milestones/date-rules";

export function buildWakeupDedupeKey(input: {
  transactionId: string;
  actionType: AgentWakeupActionType;
  taskId?: string;
}) {
  return [input.transactionId, input.actionType, input.taskId ?? "transaction"].join(":");
}

export async function scheduleAgentWakeup(input: {
  userId: string;
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
    userId: input.userId,
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
    userId: input.userId,
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function hoursFromNow(now: Date, hours: number) {
  const next = new Date(now);
  next.setUTCHours(next.getUTCHours() + hours);
  return next.toISOString();
}

function daysUntilDue(input: { today: string; dueDate?: string }) {
  const today = parseDateOnly(input.today);
  const due = parseDateOnly(input.dueDate);

  if (!today || !due) return undefined;

  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

export function computeNextHeartbeat(input: {
  context: ProactiveAgentContext;
  now?: Date;
}): { wakeAt: string; reason: string; intervalHours: number } | undefined {
  const status = stringValue(input.context.transactionContext.transaction.status);
  if (status === "closed" || status === "terminated") {
    return undefined;
  }

  const now = input.now ?? new Date();
  const blockers = input.context.transactionContext.blockers;
  const milestones = input.context.transactionContext.milestones;
  const hasCriticalBlocker = blockers.some((blocker) => blocker.risk_level === "critical");
  const hasUrgentBlocker = blockers.some((blocker) => blocker.risk_level === "urgent");
  const nearestDueDays = milestones
    .filter((milestone) => !milestone.completed_at)
    .map((milestone) =>
      daysUntilDue({
        today: input.context.temporalContext.today,
        dueDate: stringValue(milestone.due_date)
      })
    )
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b)[0];

  if (hasCriticalBlocker || (typeof nearestDueDays === "number" && nearestDueDays <= 1)) {
    return {
      wakeAt: hoursFromNow(now, 1),
      reason: "Critical blocker or deadline within 24 hours.",
      intervalHours: 1
    };
  }

  if (hasUrgentBlocker || (typeof nearestDueDays === "number" && nearestDueDays <= 3)) {
    return {
      wakeAt: hoursFromNow(now, 4),
      reason: "Urgent blocker or deadline within 72 hours.",
      intervalHours: 4
    };
  }

  if (input.context.transactionContext.transaction.phase === "opening_file") {
    return {
      wakeAt: hoursFromNow(now, 12),
      reason: "Opening file phase needs more frequent review.",
      intervalHours: 12
    };
  }

  return {
    wakeAt: addDays(now, 1).toISOString(),
    reason: "Daily active transaction heartbeat.",
    intervalHours: 24
  };
}

export async function scheduleNextHeartbeat(input: {
  context: ProactiveAgentContext;
  now?: Date;
}) {
  const next = computeNextHeartbeat(input);

  if (!next) return undefined;

  return scheduleAgentWakeup({
    userId: input.context.tcProfile.userId,
    transactionId: input.context.transactionId,
    actionType: "transaction_heartbeat",
    wakeAt: next.wakeAt,
    reason: next.reason,
    payload: {
      intervalHours: next.intervalHours,
      scheduledBy: "adaptive_heartbeat"
    }
  });
}

export async function cancelScheduledWakeups(input: {
  userId: string;
  transactionId: string;
  actionType?: AgentWakeupActionType;
  taskId?: string;
  reason: string;
}) {
  const cancelled = await cancelPendingAgentWakeups({
    transactionId: input.transactionId,
    actionType: input.actionType,
    taskId: input.taskId,
    reason: input.reason
  });

  for (const wakeup of cancelled) {
    await createAgentActivityEvent({
      userId: input.userId,
      transactionId: input.transactionId,
      sourceType: "system",
      eventType: "proactive_wakeup_cancelled",
      title: "Cancelled proactive wakeup",
      summary: `${wakeup.actionType} cancelled: ${input.reason}.`,
      status: "ignored",
      metadata: {
        wakeupId: wakeup.id,
        actionType: wakeup.actionType,
        taskId: wakeup.taskId,
        reason: input.reason
      }
    });
  }

  return cancelled;
}
