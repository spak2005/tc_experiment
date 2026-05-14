import { describe, expect, it } from "vitest";
import {
  DEFAULT_STALE_AFTER_DAYS,
  readStaleAfterDays,
  resolveTaskFollowUpDate
} from "@/lib/workflow/task-transitions";

describe("readStaleAfterDays", () => {
  it("returns the metadata value when present and positive", () => {
    expect(readStaleAfterDays({ staleAfterDays: 3 })).toBe(3);
  });

  it("falls back to default when metadata is missing", () => {
    expect(readStaleAfterDays(undefined)).toBe(DEFAULT_STALE_AFTER_DAYS);
    expect(readStaleAfterDays({})).toBe(DEFAULT_STALE_AFTER_DAYS);
  });

  it("ignores non-numeric or non-positive values", () => {
    expect(readStaleAfterDays({ staleAfterDays: "two" })).toBe(DEFAULT_STALE_AFTER_DAYS);
    expect(readStaleAfterDays({ staleAfterDays: 0 })).toBe(DEFAULT_STALE_AFTER_DAYS);
    expect(readStaleAfterDays({ staleAfterDays: -1 })).toBe(DEFAULT_STALE_AFTER_DAYS);
  });

  it("floors fractional values", () => {
    expect(readStaleAfterDays({ staleAfterDays: 2.7 })).toBe(2);
  });
});

describe("resolveTaskFollowUpDate", () => {
  it("computes today plus staleAfterDays in calendar days", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-13",
        metadata: { staleAfterDays: 2 }
      })
    ).toBe("2026-05-15");
  });

  it("uses the default offset when metadata is missing", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-13"
      })
    ).toBe("2026-05-15");
  });

  it("crosses month boundaries", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-30",
        metadata: { staleAfterDays: 3 }
      })
    ).toBe("2026-06-02");
  });

  it("prefers an explicit override over the metadata", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-13",
        metadata: { staleAfterDays: 5 },
        staleAfterDaysOverride: 1
      })
    ).toBe("2026-05-14");
  });

  it("returns undefined when today cannot be parsed", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "not-a-date"
      })
    ).toBeUndefined();
  });
});
