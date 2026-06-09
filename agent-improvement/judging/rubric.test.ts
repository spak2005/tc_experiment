import { beforeEach, describe, expect, it } from "vitest";
import { judgeRubric } from "./rubric";

describe("rubric judge", () => {
  beforeEach(() => {
    delete process.env.LLM_API_KEY;
  });

  it("requests human review when reply text is missing", async () => {
    await expect(
      judgeRubric({
        rubric: "Be a great human TC.",
        deterministicSummary: "Checks passed."
      })
    ).resolves.toMatchObject({
      status: "needs_human_review",
      misses: ["missing_reply_text"]
    });
  });

  it("requests human review when the LLM is unavailable", async () => {
    await expect(
      judgeRubric({
        rubric: "Be a great human TC.",
        replyText: "Hi, I opened the file.",
        deterministicSummary: "Checks passed."
      })
    ).resolves.toMatchObject({
      status: "needs_human_review",
      misses: ["llm_unavailable"]
    });
  });
});
