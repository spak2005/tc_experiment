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
          <h1>Stephanie is building the file in public.</h1>
          <p className="lede compact">
            See the transaction plan, what Stephanie is waiting on, and the
            latest work she has completed for each file.
          </p>
          <p className="lede compact">
            <Link className="utility-link" href="/observability">
              Open internal observability
            </Link>
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="workroom-summary" aria-label="Stephanie work summary">
        <SummaryStat label="Active files" value={snapshot.transactions.length} />
        <SummaryStat label="Waiting on you" value={snapshot.approvals.length + snapshot.blockers.length} />
        <SummaryStat
          label="Open tasks"
          value={snapshot.transactions.reduce(
            (total, transaction) => total + transaction.open_task_count,
            0
          )}
        />
      </section>

      <section className="workroom-layout">
        <section className="workroom-main" aria-label="Transaction plans">
          {snapshot.transactions.map((transaction) => (
            <article className="transaction-card" key={transaction.id}>
              <div className="transaction-card-header">
                <div>
                  <p className="eyebrow">Transaction file</p>
                  <h2>
                    <Link href={`/transactions/${transaction.id}`}>
                      {transaction.property_address ?? "Address pending"}
                    </Link>
                  </h2>
                </div>
                <span className="status-pill">{transaction.current_risk}</span>
              </div>

              <dl className="transaction-facts">
                <div>
                  <dt>Phase</dt>
                  <dd>{humanize(transaction.phase ?? transaction.status)}</dd>
                </div>
                <div>
                  <dt>Closing</dt>
                  <dd>{formatDate(transaction.closing_date)}</dd>
                </div>
                <div>
                  <dt>Documents</dt>
                  <dd>
                    {transaction.document_count - transaction.outstanding_document_count}/
                    {transaction.document_count} ready
                  </dd>
                </div>
              </dl>

              <section className="transaction-plan-preview">
                <div>
                  <span>Next milestone</span>
                  <strong>
                    {transaction.next_milestone_title ?? "Stephanie is building the timeline"}
                  </strong>
                  <small>{formatDate(transaction.next_milestone_due_date)}</small>
                </div>
                <div>
                  <span>Open work</span>
                  <strong>{pluralize(transaction.open_task_count, "task")}</strong>
                  <small>
                    {transaction.waiting_response_task_count > 0
                      ? `${transaction.waiting_response_task_count} waiting on a reply`
                      : "No stale replies flagged"}
                  </small>
                </div>
                <div>
                  <span>Permissions</span>
                  <strong>{pluralize(transaction.pending_approval_count, "approval")}</strong>
                  <small>
                    {transaction.open_blocker_count > 0
                      ? `${transaction.open_blocker_count} blocker(s) open`
                      : "No blockers open"}
                  </small>
                </div>
              </section>

              <div className="transaction-latest-work">
                <span>Latest work</span>
                <strong>{transaction.latest_activity_title ?? "No activity recorded yet"}</strong>
                <p>
                  {transaction.latest_activity_summary ??
                    "Stephanie will show her work here as soon as she starts processing this file."}
                </p>
              </div>
            </article>
          ))}
        </section>

        <aside className="workroom-sidebar" aria-label="Stephanie sidebar">
          <Panel title="Stephanie">
            <article className="row">
              <strong>{tcName}</strong>
              <span className="tc-email">
                {tcEmail ?? "Provisioning Stephanie's inbox..."}
              </span>
              {tcEmail ? <TcEmailActions email={tcEmail} /> : null}
            </article>
          </Panel>

          <Panel title="Waiting on you">
            {snapshot.approvals.length > 0 || snapshot.blockers.length > 0 ? (
              <>
                {snapshot.approvals.map((approval) => (
                  <article className="row" key={approval.id}>
                    <strong>{approval.proposed_subject}</strong>
                    <span>Needs approval before Stephanie sends</span>
                  </article>
                ))}
                {snapshot.blockers.map((blocker) => (
                  <article className="row" key={blocker.id}>
                    <strong>{blocker.title}</strong>
                    <span>{blocker.risk_level}</span>
                  </article>
                ))}
              </>
            ) : (
              <p className="empty-state">Nothing needs your attention right now.</p>
            )}
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="summary-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago"
  }).format(new Date(`${value}T12:00:00Z`));
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
