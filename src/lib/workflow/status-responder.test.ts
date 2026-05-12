import { describe, expect, it } from "vitest";
import { isStatusQuestion } from "@/lib/workflow/status-responder";

describe("isStatusQuestion", () => {
  it("detects deadline/status questions", () => {
    expect(isStatusQuestion("Is everything good, what's the next deadline?")).toBe(true);
    expect(isStatusQuestion("Where are we on this deal?")).toBe(true);
  });

  it("does not classify a contract-forwarding note as status", () => {
    expect(isStatusQuestion("Please see attached executed contract.")).toBe(false);
  });
});
