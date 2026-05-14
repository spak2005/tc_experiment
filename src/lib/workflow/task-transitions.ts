import { addDays, parseDateOnly, toDateOnly } from "@/lib/milestones/date-rules";
import {
  createAgentActivityEvent,
  findOpenTasksByOwnerRole,
  findPartyRolesByEmails,
  getTaskById,
  upsertTaskRecord,
  type OpenTaskRow
} from "@/lib/db/repositories";

export const DEFAULT_STALE_AFTER_DAYS = 2;

const REALTOR_OWNER_ROLES = new Set(["agent", "tc"]);

export function readStaleAfterDays(metadata?: Record<string, unknown> | null): number {
  const value = metadata?.staleAfterDays;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return DEFAULT_STALE_AFTER_DAYS;
}

export function resolveTaskFollowUpDate(input: {
  today: string;
  metadata?: Record<string, unknown> | null;
  staleAfterDaysOverride?: number;
}): string | undefined {
  const today = parseDateOnly(input.today);

  if (!today) return undefined;

  const offset =
    typeof input.staleAfterDaysOverride === "number" && input.staleAfterDaysOverride > 0
      ? Math.floor(input.staleAfterDaysOverride)
      : readStaleAfterDays(input.metadata);

  return toDateOnly(addDays(today, offset));
}

type ResolveResult =
  | { kind: "resolved"; task: OpenTaskRow; reason: "task_id" | "owner_role" }
  | { kind: "ambiguous"; ownerRoles: string[]; matches: number }
  | { kind: "no_external_recipient" }
  | { kind: "no_match" };

async function resolveOutboundTask(input: {
  transactionId: string;
  taskId?: string;
  recipientEmails: string[];
}): Promise<ResolveResult> {
  if (input.taskId) {
    const task = await getTaskById(input.taskId);

    if (task && task.transaction_id === input.transactionId) {
      return { kind: "resolved", task, reason: "task_id" };
    }
  }

  const roles = await findPartyRolesByEmails({
    transactionId: input.transactionId,
    emails: input.recipientEmails
  });
  const externalRoles = roles.filter((role) => !REALTOR_OWNER_ROLES.has(role));

  if (externalRoles.length === 0) {
    return { kind: "no_external_recipient" };
  }

  const matches: OpenTaskRow[] = [];
  for (const role of externalRoles) {
    const tasksForRole = await findOpenTasksByOwnerRole({
      transactionId: input.transactionId,
      ownerRole: role
    });
    matches.push(...tasksForRole);
  }

  if (matches.length === 0) {
    return { kind: "no_match" };
  }

  if (matches.length > 1) {
    return { kind: "ambiguous", ownerRoles: externalRoles, matches: matches.length };
  }

  return { kind: "resolved", task: matches[0], reason: "owner_role" };
}

export interface TransitionOutboundTaskInput {
  teamId: string;
  transactionId: string;
  taskId?: string;
  recipientEmails: string[];
  today: string;
  agentDecisionId?: string;
  approvalId?: string;
  outboundSubject?: string;
}

export interface TransitionOutboundTaskResult {
  status: "transitioned" | "skipped";
  reason: string;
  taskId?: string;
  followUpDueDate?: string;
}

export async function transitionOutboundTaskToWaitingResponse(
  input: TransitionOutboundTaskInput
): Promise<TransitionOutboundTaskResult> {
  const resolution = await resolveOutboundTask({
    transactionId: input.transactionId,
    taskId: input.taskId,
    recipientEmails: input.recipientEmails
  });

  if (resolution.kind !== "resolved") {
    await createAgentActivityEvent({
      teamId: input.teamId,
      transactionId: input.transactionId,
      agentDecisionId: input.agentDecisionId,
      sourceType: "tool",
      eventType: "outbound_task_transition_skipped",
      title: "Skipped task transition",
      summary: `Could not resolve a task to flip into waiting_response (${resolution.kind}).`,
      status: "ignored",
      metadata: {
        approvalId: input.approvalId,
        recipientEmails: input.recipientEmails,
        outboundSubject: input.outboundSubject,
        proposedTaskId: input.taskId,
        resolution
      }
    });

    return { status: "skipped", reason: resolution.kind };
  }

  const followUpDueDate = resolveTaskFollowUpDate({
    today: input.today,
    metadata: resolution.task.metadata
  });

  await upsertTaskRecord({
    transactionId: input.transactionId,
    id: resolution.task.id,
    status: "waiting_response",
    followUpDueDate: followUpDueDate ?? null
  });

  await createAgentActivityEvent({
    teamId: input.teamId,
    transactionId: input.transactionId,
    agentDecisionId: input.agentDecisionId,
    sourceType: "tool",
    eventType: "outbound_task_transitioned",
    title: "Task waiting on response",
    summary: `Flipped "${resolution.task.title}" to waiting_response${followUpDueDate ? ` until ${followUpDueDate}` : ""}.`,
    status: "waiting",
    metadata: {
      approvalId: input.approvalId,
      taskId: resolution.task.id,
      taskTitle: resolution.task.title,
      ownerRole: resolution.task.owner_role,
      previousStatus: resolution.task.status,
      previousFollowUpDueDate: resolution.task.follow_up_due_date,
      followUpDueDate,
      resolutionReason: resolution.reason,
      recipientEmails: input.recipientEmails,
      outboundSubject: input.outboundSubject
    }
  });

  return {
    status: "transitioned",
    reason: resolution.reason,
    taskId: resolution.task.id,
    followUpDueDate
  };
}
