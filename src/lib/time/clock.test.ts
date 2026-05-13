import { describe, expect, it } from "vitest";
import { formatTemporalContextLine, getTemporalContext } from "@/lib/time/clock";

describe("getTemporalContext", () => {
  it("returns today in the configured timezone", () => {
    const context = getTemporalContext({
      now: new Date("2026-05-14T04:30:00.000Z"),
      timezone: "America/Chicago"
    });

    expect(context.today).toBe("2026-05-13");
  });

  it("formats now with the timezone offset", () => {
    const context = getTemporalContext({
      now: new Date("2026-05-14T01:18:00.000Z"),
      timezone: "America/Chicago"
    });

    expect(context.now).toBe("2026-05-13T20:18:00-05:00");
  });

  it("marks weekdays as business days", () => {
    const context = getTemporalContext({
      now: new Date("2026-05-13T17:00:00.000Z"),
      timezone: "America/Chicago"
    });

    expect(context.businessDay).toBe(true);
  });

  it("marks weekends as non-business days", () => {
    const context = getTemporalContext({
      now: new Date("2026-05-16T17:00:00.000Z"),
      timezone: "America/Chicago"
    });

    expect(context.businessDay).toBe(false);
  });

  it("marks known holidays as non-business days", () => {
    const context = getTemporalContext({
      now: new Date("2026-07-04T17:00:00.000Z"),
      timezone: "America/Chicago"
    });

    expect(context.businessDay).toBe(false);
  });
});

describe("formatTemporalContextLine", () => {
  it("formats the compact LLM context line", () => {
    expect(
      formatTemporalContextLine({
        now: "2026-05-13T20:18:00-05:00",
        today: "2026-05-13",
        timezone: "America/Chicago",
        businessDay: true
      })
    ).toBe("Current date: 2026-05-13. Timezone: America/Chicago.");
  });
});
