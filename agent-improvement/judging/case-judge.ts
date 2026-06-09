import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDiagnosticsBundle } from "@improvement/diagnostics/bundle";
import { resolveDiagnosticsRun } from "@improvement/diagnostics/resolve";
import {
  caseManifestPath,
  readImprovementCase,
  stateRoot
} from "@improvement/loop/state";
import { createHumanReviewItem } from "@improvement/human-review/state";
import { renderHumanStatusHtml } from "@improvement/human-review/status-page";
import { judgeDeterministicIntake } from "./deterministic";
import { judgeRubric } from "./rubric";

export async function judgeImprovementCase(input: {
  cwd?: string;
  caseId: string;
  caseRunId: string;
  replyText?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const manifest = await readImprovementCase({ cwd, caseId: input.caseId });
  const resolved = await resolveDiagnosticsRun({ caseRunId: input.caseRunId });
  if (!resolved) throw new Error(`No activity run found for ${input.caseRunId}.`);
  const bundle = await getDiagnosticsBundle({
    activityRunId: resolved.activityRunId,
    userId: resolved.userId,
    depth: "standard"
  });
  if (!bundle) throw new Error("Diagnostics bundle not found.");

  const deterministic = judgeDeterministicIntake(bundle, env);
  const rubricPath = path.join(
    stateRoot(cwd),
    "rubrics",
    `${manifest.rubricId}.md`
  );
  const rubric = await readFile(rubricPath, "utf8");
  const rubricResult = await judgeRubric({
    rubric,
    replyText: input.replyText,
    deterministicSummary: deterministic.summary
  });
  const status =
    deterministic.status === "fail" || rubricResult.status === "fail"
      ? "fail"
      : rubricResult.status === "pass"
        ? "pass"
        : "needs_human_review";
  const summary =
    status === "pass"
      ? "Stephanie met the deterministic checks and human-TC rubric. No implementation change is needed."
      : status === "fail"
        ? "Stephanie missed at least one required check or rubric expectation."
        : "The case needs human review before deciding whether to change code.";

  const judgedAt = new Date().toISOString();
  const updated = {
    ...manifest,
    status: status === "pass" ? "no_gap" : status === "fail" ? "gap_found" : manifest.status,
    latestJudgment: {
      status,
      summary,
      judgedAt
    },
    runs: manifest.runs.map((run) =>
      run.caseRunId === input.caseRunId
        ? {
            ...run,
            activityRunId: resolved.activityRunId,
            diagnosticsDepth: "standard" as const,
            status: "judged" as const,
            result: summary,
            updatedAt: judgedAt
          }
        : run
    ),
    updatedAt: judgedAt
  };
  await writeFile(
    caseManifestPath(manifest.caseId, cwd),
    `${JSON.stringify(updated, null, 2)}\n`
  );

  let humanReviewItemId: string | undefined;
  if (status === "needs_human_review") {
    const { item } = await createHumanReviewItem({
      cwd,
      type: "question",
      title: `Review ${manifest.caseId}`,
      body:
        rubricResult.summary ||
        "Codex needs your judgment before deciding whether to change Stephanie.",
      caseId: manifest.caseId,
      caseRunId: input.caseRunId
    });
    humanReviewItemId = item.id;
  }
  await renderHumanStatusHtml({ cwd });

  return {
    status,
    summary,
    deterministic,
    rubric: rubricResult,
    activityRunId: resolved.activityRunId,
    humanReviewItemId
  };
}
