import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "@improvement/loop/state";
import {
  activeHumanReviewItems,
  readHumanReviewState
} from "./state";
import type { HumanReviewItem } from "./schema";
import { improvementCaseManifestSchema } from "@improvement/loop/case-manifest";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortText(value: string, max = 260) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function statusPagePath(cwd = process.cwd()) {
  return path.join(stateRoot(cwd), "status.html");
}

async function readCurrentLoop(cwd: string) {
  const filePath = path.join(stateRoot(cwd), "current-loop.md");
  return existsSync(filePath) ? readFile(filePath, "utf8") : "";
}

function extractMarkdownValue(body: string, label: string) {
  const match = body.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

async function latestCase(cwd: string) {
  const casesDir = path.join(stateRoot(cwd), "cases");
  if (!existsSync(casesDir)) return undefined;
  const files = (await readdir(casesDir))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();

  for (const file of files) {
    try {
      const parsed = improvementCaseManifestSchema.parse(
        JSON.parse(await readFile(path.join(casesDir, file), "utf8"))
      );
      return parsed;
    } catch {
      continue;
    }
  }

  return undefined;
}

function reviewCard(item: HumanReviewItem) {
  return `<article class="card need">
    <div class="eyebrow">${escapeHtml(item.type.replace(/_/g, " "))}</div>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(shortText(item.body))}</p>
    <small>${escapeHtml(item.id)}${item.caseId ? ` · ${escapeHtml(item.caseId)}` : ""}</small>
  </article>`;
}

function section(title: string, body: string) {
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    ${body}
  </section>`;
}

function simpleCard(title: string, body: string, accent = "") {
  return `<article class="card ${accent}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(shortText(body || "Nothing recorded yet."))}</p>
  </article>`;
}

export async function renderHumanStatusHtml(input: {
  cwd?: string;
  generatedAt?: Date;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const generatedAt = input.generatedAt ?? new Date();
  const reviewState = await readHumanReviewState(cwd);
  const activeItems = activeHumanReviewItems(reviewState);
  const archivedCount = reviewState.items.length - activeItems.length;
  const currentLoop = await readCurrentLoop(cwd);
  const currentCase = await latestCase(cwd);
  const latestRun = currentCase?.runs.at(-1);
  const latestJudgment = currentCase?.latestJudgment;
  const currentCaseId = extractMarkdownValue(currentLoop, "Case") ?? "None";
  const currentTitle = extractMarkdownValue(currentLoop, "Title") ?? currentCase?.title ?? "No active case";
  const nextStepMatch = currentLoop.match(/## Next Step\s+([\s\S]+)$/);
  const nextStep = nextStepMatch?.[1]?.trim() ?? "Create or select a case.";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stephanie Improvement Status</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: #f6f7f9; }
    body { margin: 0; padding: 32px; }
    main { max-width: 980px; margin: 0 auto; }
    header { margin-bottom: 28px; }
    h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: 0; }
    h2 { margin: 28px 0 12px; font-size: 18px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 16px; letter-spacing: 0; }
    p { margin: 0; line-height: 1.5; }
    small { display: block; margin-top: 12px; color: #697586; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .card { background: #fff; border: 1px solid #d9e1e8; border-radius: 8px; padding: 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .need { border-left: 4px solid #c2410c; }
    .pass { border-left: 4px solid #15803d; }
    .watch { border-left: 4px solid #2563eb; }
    .eyebrow { margin-bottom: 8px; color: #697586; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .empty { color: #52606d; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Stephanie Improvement Status</h1>
      <p>Generated ${escapeHtml(generatedAt.toLocaleString("en-US", { timeZone: "America/Chicago" }))}</p>
      <small>${activeItems.length} active item(s), ${archivedCount} archived item(s)</small>
    </header>

    ${section(
      "Needs You",
      activeItems.length > 0
        ? `<div class="grid">${activeItems.map(reviewCard).join("\n")}</div>`
        : `<p class="empty">Nothing needs your input right now.</p>`
    )}

    ${section(
      "Current Loop",
      `<div class="grid">
        ${simpleCard("Current Case", `${currentCaseId}: ${currentTitle}`, "watch")}
        ${simpleCard("Next Step", nextStep)}
      </div>`
    )}

    ${section(
      "Latest Run",
      `<div class="grid">
        ${simpleCard("Run", latestRun ? `${latestRun.caseRunId} is ${latestRun.status}.` : "No run recorded yet.")}
        ${simpleCard("Result", latestRun?.result ?? latestJudgment?.summary ?? "No result recorded yet.", latestJudgment?.status === "pass" ? "pass" : "")}
      </div>`
    )}

    ${section(
      "Codex Decision",
      simpleCard(
        latestJudgment?.status === "pass" ? "No Change Needed" : "Current Decision",
        latestJudgment?.summary ?? "No judgment recorded yet.",
        latestJudgment?.status === "pass" ? "pass" : "watch"
      )
    )}

    ${section("Change Made", simpleCard("Latest Change", currentCase?.status === "fixed" ? "A fix has been recorded for this case." : "No code change recorded for this case yet."))}

    ${section("Rerun Result", simpleCard("Latest Rerun", latestRun ? latestRun.result ?? `${latestRun.status}.` : "No rerun recorded yet."))}
  </main>
</body>
</html>
`;

  const outputPath = statusPagePath(cwd);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
  return { html, outputPath, activeCount: activeItems.length, archivedCount };
}
