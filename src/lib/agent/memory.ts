export interface DealMemory {
  dealBrief: string;
  activeQuestionsAndWarnings: string[];
  lastInboundAt?: string;
  updatedAt?: string;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => stringValue(item))
        .filter((item) => item.length > 0)
    : [];
}

export function buildDealMemory(memory?: Record<string, unknown>): DealMemory {
  if (!memory) {
    return {
      dealBrief: "",
      activeQuestionsAndWarnings: []
    };
  }

  return {
    dealBrief: stringValue(memory.summary),
    activeQuestionsAndWarnings: stringArray(memory.open_questions),
    lastInboundAt: stringValue(memory.last_inbound_at) || undefined,
    updatedAt: stringValue(memory.updated_at) || undefined
  };
}
