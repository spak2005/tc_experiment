import {
  findActivityRunByImprovementCaseRunId,
  findActivityRunOwner
} from "@/lib/db/repositories";

export async function resolveDiagnosticsRun(input: {
  activityRunId?: string;
  caseRunId?: string;
}) {
  if (input.activityRunId) {
    const userId = await findActivityRunOwner(input.activityRunId);
    if (!userId) return null;
    return {
      activityRunId: input.activityRunId,
      userId,
      source: "activity-run-id" as const
    };
  }

  if (input.caseRunId) {
    const run = await findActivityRunByImprovementCaseRunId(input.caseRunId);
    if (!run) return null;
    return {
      activityRunId: run.id,
      userId: run.user_id,
      source: "case-run-id" as const,
      run
    };
  }

  throw new Error("Provide --activity-run-id or --case-run-id.");
}
