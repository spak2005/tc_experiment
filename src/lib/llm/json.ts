export function parseJsonObject<T>(text: string): T {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("LLM response did not contain a JSON object.");
    }

    return JSON.parse(match[0]) as T;
  }
}

export function getFirstTextBlock(content: Array<{ type: string; text?: string }>) {
  const block = content.find((item) => item.type === "text" && item.text);

  if (!block?.text) {
    throw new Error("LLM response did not include text content.");
  }

  return block.text;
}
