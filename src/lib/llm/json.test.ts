import { describe, expect, it } from "vitest";
import { parseJsonObject } from "@/lib/llm/json";

describe("parseJsonObject", () => {
  it("parses plain JSON", () => {
    expect(parseJsonObject<{ ok: boolean }>("{\"ok\":true}")).toEqual({ ok: true });
  });

  it("extracts JSON from surrounding text", () => {
    expect(parseJsonObject<{ ok: boolean }>("Here:\n{\"ok\":true}\nDone")).toEqual({
      ok: true
    });
  });
});
