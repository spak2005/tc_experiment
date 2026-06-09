import { z } from "zod";

export const humanReviewItemTypes = [
  "decision",
  "question",
  "blocked_request",
  "outside_logs_needed",
  "result_update"
] as const;

export const humanReviewStatuses = [
  "open",
  "answered",
  "acknowledged",
  "resolved"
] as const;

export const humanReviewItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(humanReviewItemTypes),
  status: z.enum(humanReviewStatuses),
  title: z.string().min(1),
  body: z.string().min(1),
  caseId: z.string().optional(),
  caseRunId: z.string().optional(),
  answer: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().optional()
});

export const humanReviewStateSchema = z.object({
  schemaVersion: z.literal("steph-human-review.v1"),
  items: z.array(humanReviewItemSchema)
});

export type HumanReviewItem = z.infer<typeof humanReviewItemSchema>;
export type HumanReviewState = z.infer<typeof humanReviewStateSchema>;
export type HumanReviewItemType = (typeof humanReviewItemTypes)[number];
export type HumanReviewStatus = (typeof humanReviewStatuses)[number];

export function parseHumanReviewState(value: unknown) {
  return humanReviewStateSchema.parse(value);
}
