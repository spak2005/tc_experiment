import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPublicUrl, getPublicAppUrl } from "@/lib/config/urls";

vi.mock("@/lib/config/env", () => ({
  getEnv: vi.fn()
}));

const { getEnv } = await import("@/lib/config/env");

describe("public URL helpers", () => {
  beforeEach(() => {
    vi.mocked(getEnv).mockReturnValue({
      NEXT_PUBLIC_APP_URL: "https://tc.example.com/"
    } as ReturnType<typeof getEnv>);
  });

  it("normalizes the configured public app URL", () => {
    expect(getPublicAppUrl()).toBe("https://tc.example.com");
  });

  it("builds absolute app URLs with or without a leading slash", () => {
    expect(buildPublicUrl("/calendar/transactions/token-1")).toBe(
      "https://tc.example.com/calendar/transactions/token-1"
    );
    expect(buildPublicUrl("api/calendar-feeds/token-1")).toBe(
      "https://tc.example.com/api/calendar-feeds/token-1"
    );
  });
});
