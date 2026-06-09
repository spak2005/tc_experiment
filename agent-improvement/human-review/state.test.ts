import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acknowledgeHumanReviewItem,
  activeHumanReviewItems,
  answerHumanReviewItem,
  createHumanReviewItem,
  readHumanReviewState,
  resolveHumanReviewItem
} from "./state";

async function tempRepo() {
  return mkdtemp(path.join(os.tmpdir(), "steph-human-review-"));
}

describe("human review state", () => {
  it("creates open items and lists active items", async () => {
    const cwd = await tempRepo();
    await createHumanReviewItem({
      cwd,
      id: "HR-1",
      type: "question",
      title: "Need your taste",
      body: "Which email tone feels right?",
      now: new Date("2026-06-09T12:00:00.000Z")
    });

    const state = await readHumanReviewState(cwd);

    expect(state.items[0]).toMatchObject({
      id: "HR-1",
      status: "open",
      type: "question"
    });
    expect(activeHumanReviewItems(state)).toHaveLength(1);
  });

  it("answers items and keeps them archived", async () => {
    const cwd = await tempRepo();
    await createHumanReviewItem({
      cwd,
      id: "HR-2",
      type: "question",
      title: "Need logs",
      body: "Please check AgentMail.",
      now: new Date("2026-06-09T12:00:00.000Z")
    });

    await answerHumanReviewItem({
      cwd,
      itemId: "HR-2",
      answer: "AgentMail shows the webhook arrived.",
      now: new Date("2026-06-09T12:05:00.000Z")
    });

    const state = await readHumanReviewState(cwd);
    expect(state.items[0]).toMatchObject({
      status: "answered",
      answer: "AgentMail shows the webhook arrived."
    });
    expect(activeHumanReviewItems(state)).toEqual([]);
    expect(await readFile(path.join(cwd, "agent-improvement/state/human-review.json"), "utf8")).toContain(
      "AgentMail shows"
    );
  });

  it("acknowledges and resolves items without deleting them", async () => {
    const cwd = await tempRepo();
    await createHumanReviewItem({
      cwd,
      id: "HR-3",
      type: "decision",
      title: "Decision",
      body: "Use a warmer opener.",
      now: new Date("2026-06-09T12:00:00.000Z")
    });
    await createHumanReviewItem({
      cwd,
      id: "HR-4",
      type: "blocked_request",
      title: "Blocked",
      body: "Need Vercel logs.",
      now: new Date("2026-06-09T12:01:00.000Z")
    });

    await acknowledgeHumanReviewItem({
      cwd,
      itemId: "HR-3",
      now: new Date("2026-06-09T12:05:00.000Z")
    });
    await resolveHumanReviewItem({
      cwd,
      itemId: "HR-4",
      now: new Date("2026-06-09T12:06:00.000Z")
    });

    const state = await readHumanReviewState(cwd);
    expect(state.items).toHaveLength(2);
    expect(activeHumanReviewItems(state)).toEqual([]);
    expect(state.items.map((item) => item.status).sort()).toEqual([
      "acknowledged",
      "resolved"
    ]);
  });
});
