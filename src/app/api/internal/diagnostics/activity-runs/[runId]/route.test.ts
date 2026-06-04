import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/diagnostics/activity-runs/[runId]/route";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDiagnosticsBundle: vi.fn()
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@improvement/diagnostics/bundle", () => ({
  getDiagnosticsBundle: mocks.getDiagnosticsBundle
}));

describe("activity run diagnostics API", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.getDiagnosticsBundle.mockReset();
  });

  it("requires an authenticated user", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://tc.example.com/api/internal/diagnostics/activity-runs/run-1"),
      {
        params: Promise.resolve({ runId: "run-1" })
      }
    );

    expect(response.status).toBe(401);
    expect(mocks.getDiagnosticsBundle).not.toHaveBeenCalled();
  });

  it("returns not found for absent or unowned runs", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      authUserId: "auth-1",
      email: "agent@example.com",
      name: "Agent"
    });
    mocks.getDiagnosticsBundle.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://tc.example.com/api/internal/diagnostics/activity-runs/run-1"),
      {
        params: Promise.resolve({ runId: "run-1" })
      }
    );

    expect(response.status).toBe(404);
  });

  it("returns diagnostics for the requested depth", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      authUserId: "auth-1",
      email: "agent@example.com",
      name: "Agent"
    });
    mocks.getDiagnosticsBundle.mockResolvedValueOnce({
      schemaVersion: "agent-diagnostics.v1",
      request: {
        activityRunId: "run-1",
        userId: "user-1",
        depth: "raw"
      }
    });

    const response = await GET(
      new Request("https://tc.example.com/api/internal/diagnostics/activity-runs/run-1?depth=raw"),
      {
        params: Promise.resolve({ runId: "run-1" })
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.request.depth).toBe("raw");
    expect(mocks.getDiagnosticsBundle).toHaveBeenCalledWith({
      activityRunId: "run-1",
      userId: "user-1",
      depth: "raw"
    });
  });

  it("defaults invalid depths to summary", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      authUserId: "auth-1",
      email: "agent@example.com",
      name: "Agent"
    });
    mocks.getDiagnosticsBundle.mockResolvedValueOnce({
      schemaVersion: "agent-diagnostics.v1"
    });

    await GET(
      new Request("https://tc.example.com/api/internal/diagnostics/activity-runs/run-1?depth=huge"),
      {
        params: Promise.resolve({ runId: "run-1" })
      }
    );

    expect(mocks.getDiagnosticsBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        depth: "summary"
      })
    );
  });
});

