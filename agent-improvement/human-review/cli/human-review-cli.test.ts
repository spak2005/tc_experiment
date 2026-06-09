import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requiredStateFiles } from "@improvement/loop/state";
import { runAckHumanCli } from "./ack";
import { runAnswerHumanCli } from "./answer";
import { runAskHumanCli } from "./ask-human";
import { runPauseHumanCli } from "./pause";
import { runImproveStatusCli } from "./status";

async function tempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "steph-human-cli-"));
  for (const file of requiredStateFiles) {
    const fullPath = path.join(cwd, "agent-improvement", "state", file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `# ${path.basename(file)}\n`);
  }
  await writeFile(
    path.join(cwd, "agent-improvement", "state", "human-review.json"),
    JSON.stringify({ schemaVersion: "steph-human-review.v1", items: [] })
  );
  return cwd;
}

describe("human review CLIs", () => {
  let cwd: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await tempRepo();
    process.chdir(cwd);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("creates, acknowledges, and answers review items while rendering status", async () => {
    await runAskHumanCli([
      "--type",
      "question",
      "--title",
      "Need tone",
      "--body",
      "Should Stephanie be warmer?"
    ]);

    let state = JSON.parse(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "human-review.json"),
        "utf8"
      )
    );
    const itemId = state.items[0].id;
    expect(state.items[0]).toMatchObject({
      status: "open",
      title: "Need tone"
    });
    expect(
      await readFile(path.join(cwd, "agent-improvement", "state", "status.html"), "utf8")
    ).toContain("Need tone");

    await runAckHumanCli(["--item-id", itemId]);
    state = JSON.parse(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "human-review.json"),
        "utf8"
      )
    );
    expect(state.items[0].status).toBe("acknowledged");
    expect(
      await readFile(path.join(cwd, "agent-improvement", "state", "status.html"), "utf8")
    ).not.toContain("Need tone");

    await runPauseHumanCli(["--reason", "Need Vercel logs"]);
    state = JSON.parse(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "human-review.json"),
        "utf8"
      )
    );
    const pauseId = state.items[0].id;
    await runAnswerHumanCli([
      "--item-id",
      pauseId,
      "--body",
      "Vercel logs show no function error."
    ]);
    state = JSON.parse(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "human-review.json"),
        "utf8"
      )
    );
    expect(state.items[0]).toMatchObject({
      status: "answered",
      answer: "Vercel logs show no function error."
    });
  });

  it("regenerates status without changing review state", async () => {
    await runImproveStatusCli();

    expect(
      await readFile(path.join(cwd, "agent-improvement", "state", "status.html"), "utf8")
    ).toContain("Stephanie Improvement Status");
  });
});
