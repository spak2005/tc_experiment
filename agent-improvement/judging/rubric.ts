import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { parseJsonObject } from "@/lib/llm/json";

export interface RubricJudgeInput {
  rubric: string;
  replyText?: string;
  deterministicSummary: string;
}

export interface RubricJudgeResult {
  status: "pass" | "fail" | "needs_human_review";
  summary: string;
  qualityScore?: number;
  misses: string[];
}

export async function judgeRubric(input: RubricJudgeInput): Promise<RubricJudgeResult> {
  if (!input.replyText?.trim()) {
    return {
      status: "needs_human_review",
      summary: "No Stephanie reply text was supplied for human-quality judging.",
      misses: ["missing_reply_text"]
    };
  }

  if (!process.env.LLM_API_KEY) {
    return {
      status: "needs_human_review",
      summary: "LLM_API_KEY is not available, so rubric judging needs human review.",
      misses: ["llm_unavailable"]
    };
  }

  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1200,
    system:
      "You judge whether Stephanie, an AI transaction coordinator, met a great human TC quality bar. Return only JSON.",
    messages: [
      {
        role: "user",
        content: `Rubric:\n${input.rubric}\n\nDeterministic summary:\n${input.deterministicSummary}\n\nStephanie reply:\n${input.replyText}\n\nReturn JSON with status pass|fail|needs_human_review, summary, qualityScore 0-1, and misses array.`
      }
    ]
  });
  const text = message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
  const parsed = parseJsonObject<Partial<RubricJudgeResult>>(text);

  return {
    status:
      parsed.status === "pass" ||
      parsed.status === "fail" ||
      parsed.status === "needs_human_review"
        ? parsed.status
        : "needs_human_review",
    summary: typeof parsed.summary === "string" ? parsed.summary : "Rubric judge returned an incomplete result.",
    qualityScore:
      typeof parsed.qualityScore === "number" ? parsed.qualityScore : undefined,
    misses: Array.isArray(parsed.misses) ? parsed.misses.map(String) : []
  };
}
