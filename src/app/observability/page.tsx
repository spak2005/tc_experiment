import Link from "next/link";
import { ActivityDebugger } from "@/app/components/activity-debugger";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getUserActivityTimeline } from "@/lib/db/repositories";

export default async function ObservabilityPage() {
  const user = await requireCurrentUser();
  const activity = await getUserActivityTimeline(user.id);

  return (
    <main className="dashboard">
      <header className="observability-header">
        <div>
          <p className="eyebrow">Agent observability</p>
          <h1>Watch the agent work.</h1>
          <p className="lede compact">
            {activity.length} recent events · newest first
          </p>
        </div>
        <Link className="utility-link" href="/dashboard">
          Back to dashboard
        </Link>
      </header>

      <section className="observability-layout">
        <ActivityDebugger
          emptyText="No agent activity recorded yet."
          events={activity}
          eyebrow="Observability stream"
          showTransactionLinks
          title="All Agent Activity"
        />
      </section>
    </main>
  );
}
