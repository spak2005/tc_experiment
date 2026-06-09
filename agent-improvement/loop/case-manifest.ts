import { z } from "zod";
import { improvementFailureTypes } from "./failure-types";

export const improvementCaseStatuses = [
  "planned",
  "running",
  "gap_found",
  "no_gap",
  "fixed",
  "blocked"
] as const;

export const caseRunStatuses = [
  "planned",
  "sent",
  "observed",
  "judged",
  "passed",
  "failed",
  "blocked"
] as const;

const caseRunSchema = z.object({
  caseRunId: z.string().min(1),
  activityRunId: z.string().optional(),
  sentMessageId: z.string().optional(),
  replyMessageId: z.string().optional(),
  status: z.enum(caseRunStatuses),
  diagnosticsDepth: z.enum(["summary", "standard", "raw"]).optional(),
  result: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const improvementCaseManifestSchema = z.object({
  schemaVersion: z.literal("steph-improvement-case.v1"),
  caseId: z.string().min(1),
  title: z.string().min(1),
  failureType: z.enum(improvementFailureTypes),
  rubricId: z.string().min(1),
  status: z.enum(improvementCaseStatuses),
  stimulus: z.object({
    description: z.string(),
    fixturePaths: z.array(z.string()).default([]),
    subject: z.string().optional(),
    body: z.string().optional()
  }),
  expectedBehavior: z.string(),
  latestJudgment: z
    .object({
      status: z.enum(["pass", "fail", "needs_human_review"]),
      summary: z.string(),
      judgedAt: z.string()
    })
    .optional(),
  runs: z.array(caseRunSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ImprovementCaseManifest = z.infer<
  typeof improvementCaseManifestSchema
>;

export function parseImprovementCaseManifest(value: unknown) {
  return improvementCaseManifestSchema.parse(value);
}
