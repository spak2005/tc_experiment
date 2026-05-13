import { getTransactionDetail } from "@/lib/db/repositories";
import { ActivityDebugger } from "@/app/components/activity-debugger";

export default async function TransactionDetailPage({
  params
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const detail = await getTransactionDetail(transactionId);

  if (!detail.transaction) {
    return (
      <main className="dashboard">
        <h1>Transaction not found.</h1>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header>
        <p className="eyebrow">Transaction file</p>
        <h1>{detail.transaction.property_address ?? "Address pending"}</h1>
        <p className="lede compact">
          {detail.transaction.status} · {detail.transaction.phase ?? "no phase"} ·
          closing {detail.transaction.closing_date ?? "pending"}
        </p>
      </header>

      <section className="detail-grid">
        <div className="detail-grid-full">
          <ActivityDebugger events={detail.activityTimeline} />
        </div>

        <Panel title="Milestones">
          {detail.milestones.map((milestone) => (
            <article className="row" key={milestone.key}>
              <strong>{milestone.title}</strong>
              <span>
                {milestone.due_date ?? "event-triggered"} · {milestone.risk_level}
              </span>
              <small>{milestone.source_reference}</small>
            </article>
          ))}
        </Panel>

        <Panel title="Tasks">
          {detail.tasks.map((task) => (
            <article className="row" key={`${task.title}-${task.owner_role}`}>
              <strong>{task.title}</strong>
              <span>
                {task.status} · owner: {task.owner_role}
              </span>
            </article>
          ))}
        </Panel>

        <Panel title="Documents">
          {detail.documents.map((document) => (
            <article className="row" key={`${document.name}-${document.blob_key}`}>
              <strong>{document.name}</strong>
              <span>
                {document.type} · {document.status}
              </span>
            </article>
          ))}
        </Panel>

        <Panel title="Messages">
          {detail.messages.map((message) => (
            <article className="row" key={`${message.subject}-${message.received_at}`}>
              <strong>{message.subject}</strong>
              <span>
                from {message.from_address} · {message.received_at ?? message.sent_at}
              </span>
              <small>{message.summary}</small>
            </article>
          ))}
        </Panel>

        <Panel title="Extracted Facts">
          <pre>{JSON.stringify(detail.facts?.facts ?? {}, null, 2)}</pre>
        </Panel>

        <Panel title="Audit Trail">
          {detail.auditEvents.map((event) => (
            <article className="row" key={`${event.event_type}-${event.created_at}`}>
              <strong>{event.event_type}</strong>
              <span>
                {event.actor} · {event.created_at}
              </span>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
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
