import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  findTcProfileByUser,
  getDashboardSnapshotForUser
} from "@/lib/db/repositories";
import { LogoutButton } from "@/app/components/logout-button";
import { TcEmailActions } from "@/app/components/tc-email-actions";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const [snapshot, tcProfile] = await Promise.all([
    getDashboardSnapshotForUser(user.id),
    findTcProfileByUser(user.id)
  ]);
  const tcName = tcProfile?.display_name ?? "Stephanie";
  const tcEmail = tcProfile?.inbox_address;

  if (snapshot.transactions.length === 0) {
    return (
      <main className="dashboard first-run-dashboard">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Stephanie is hired</p>
            <h1>Stephanie is ready for her first file.</h1>
            <p className="lede compact">
              She sent you a short introduction email so you have her
              address in your inbox. When you are ready, forward her an executed
              contract and she will take it from there.
            </p>
          </div>
          <LogoutButton />
        </header>

        <section className="first-run-grid">
          <section className="first-run-primary">
            <p className="status-pill">Introduction email sent</p>
            <h2>Assign Stephanie a transaction.</h2>
            <p>
              Forward an executed contract to Stephanie. She will open the file,
              build the timeline, request missing items, and flag anything that
              needs your attention.
            </p>
            <div className="tc-email-block">
              <span>{tcName}'s inbox</span>
              <strong className="tc-email">
                {tcEmail ?? "Provisioning Stephanie's inbox..."}
              </strong>
              {tcEmail ? <TcEmailActions email={tcEmail} /> : null}
              <small>Check your inbox for Stephanie's introduction.</small>
            </div>
          </section>

          <section className="first-run-plan">
            <h2>What Stephanie does next</h2>
            <ol>
              <li>Reads the executed contract.</li>
              <li>Pulls out parties, key dates, and deadlines.</li>
              <li>Opens the transaction file and checklist.</li>
              <li>Emails you when something needs your attention.</li>
            </ol>
            <p>
              Stephanie is AI-powered, works through email, and asks before
              external messages go out.
            </p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Stephanie's workroom</p>
          <h1>Files Stephanie is watching.</h1>
          <p className="lede compact">
            You do not need to monitor this page. Stephanie will email you when
            something needs your attention.
          </p>
          <p className="lede compact">
            <Link className="utility-link" href="/observability">
              Open agent observability
            </Link>
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="dashboard-grid">
        <Panel title="Stephanie">
          <article className="row">
            <strong>{tcName}</strong>
            <span className="tc-email">
              {tcEmail ?? "Provisioning Stephanie's inbox..."}
            </span>
            {tcEmail ? <TcEmailActions email={tcEmail} /> : null}
          </article>
        </Panel>

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
          {snapshot.blockers.length > 0 ? (
            snapshot.blockers.map((blocker) => (
              <article className="row" key={blocker.id}>
                <strong>{blocker.title}</strong>
                <span>{blocker.risk_level}</span>
              </article>
            ))
          ) : (
            <p className="empty-state">No blockers need your attention.</p>
          )}
        </Panel>

        <Panel title="Approvals">
          {snapshot.approvals.length > 0 ? (
            snapshot.approvals.map((approval) => (
              <article className="row" key={approval.id}>
                <strong>{approval.proposed_subject}</strong>
                <span>Waiting for approval</span>
              </article>
            ))
          ) : (
            <p className="empty-state">Stephanie has nothing waiting on you.</p>
          )}
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
