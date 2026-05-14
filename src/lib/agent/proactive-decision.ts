import { z } from "zod";
import { transactionWritesSchema } from "@/lib/transaction-writes/schemas";

export const proactiveNextWakeupSchema = z.object({
  actionType: z.enum(["transaction_dispatch", "transaction_heartbeat", "task_follow_up"]),
  wakeAt: z.string().datetime(),
  reason: z.string().min(1),
  taskId: z.string().uuid().optional(),
  dedupeKey: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  preconditions: z.record(z.unknown()).optional()
});

export const proactiveDecisionSchema = z.object({
  action: z.enum([
    "send_realtor_email",
    "draft_external_email",
    "apply_updates",
    "schedule_wakeup",
    "noop"
  ]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  taskId: z.string().uuid().optional(),
  requiresApproval: z.boolean(),
  response: z
    .object({
      subject: z.string(),
      body: z.string(),
      to: z.array(z.string()).min(1),
      cc: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional()
    })
    .optional(),
  transactionWrites: transactionWritesSchema,
  nextWakeup: proactiveNextWakeupSchema.optional()
});

export type ProactiveNextWakeup = z.infer<typeof proactiveNextWakeupSchema>;
export type ProactiveDecision = z.infer<typeof proactiveDecisionSchema>;
