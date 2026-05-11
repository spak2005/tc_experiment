import { AgentMailClient } from "agentmail";
import { requireEnv } from "@/lib/config/env";

let client: AgentMailClient | undefined;

export function getAgentMailClient(): AgentMailClient {
  if (!client) {
    client = new AgentMailClient({
      apiKey: requireEnv("AGENTMAIL_API_KEY")
    });
  }

  return client;
}
