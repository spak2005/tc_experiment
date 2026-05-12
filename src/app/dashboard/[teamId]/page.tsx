import { getDashboardSnapshot } from "@/lib/db/repositories";
import Link from "next/link";

export default async function DashboardPage({
  params
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const snapshot = await getDashboardSnapshot(teamId);

  return (
    <main className="dashboard">
      <header>
        <p className="eyebrow">TC control room</p>
        <h1>Active files, blockers, and approvals.</h1>
      </header>

      <section className="dashboard-grid">
        <Panel title="Transactions">
          {snapshot.transactions.map((transaction) => (
            <article className="row" key={transaction.id}>
              <strong>
                <Link href={`/transactions/${transaction.id}`}>
                  {transaction.property_address ?? "Address pending"}
                </Link>
              </strong>
              <span>
                {transaction.status} · {transaction.phase ?? "no phase"} ·{" "}
                {transaction.current_risk}
              </span>
            </article>
          ))}
        </Panel>

        <Panel title="Blockers">
          {snapshot.blockers.map((blocker) => (
            <article className="row" key={blocker.id}>
              <strong>{blocker.title}</strong>
              <span>{blocker.risk_level}</span>
            </article>
          ))}
        </Panel>

        <Panel title="Approvals">
          {snapshot.approvals.map((approval) => (
            <article className="row" key={approval.id}>
              <strong>{approval.proposed_subject}</strong>
              <span>Waiting for approval</span>
            </article>
          ))}
        </Panel>
      </section>
    </main>
  );
}

function Panel({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="rows">{children}</div>
    </section>
  );
}
