import Anthropic from "@anthropic-ai/sdk";
import { getEnv, requireEnv } from "@/lib/config/env";

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: requireEnv("LLM_API_KEY")
    });
  }

  return client;
}

export function getAnthropicModel() {
  return getEnv().ANTHROPIC_MODEL;
}
