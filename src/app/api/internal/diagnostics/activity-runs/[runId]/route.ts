import { NextResponse } from "next/server";
import { getDiagnosticsBundle } from "@improvement/diagnostics/bundle";
import { parseDiagnosticsDepth } from "@improvement/diagnostics/depth";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await context.params;
  const url = new URL(request.url);
  const depth = parseDiagnosticsDepth(url.searchParams.get("depth"));
  const bundle = await getDiagnosticsBundle({
    activityRunId: runId,
    userId: user.id,
    depth
  });

  if (!bundle) {
    return NextResponse.json({ error: "Activity run not found" }, { status: 404 });
  }

  return NextResponse.json(bundle, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

