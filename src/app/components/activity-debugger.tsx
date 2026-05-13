import Link from "next/link";
import type { AgentActivityEvent } from "@/lib/agent/activity";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function metadataChips(event: AgentActivityEvent) {
  const metadata = event.metadata;
  const chips: string[] = [];

  for (const key of [
    "confidence",
    "matchConfidence",
    "result",
    "policyResult",
    "status",
    "filename",
    "subject",
    "count",
    "riskLevel"
  ]) {
    const value = metadata[key];
    if (typeof value === "string" || typeof value === "number") {
      chips.push(`${key}: ${value}`);
    }
  }

  const to = metadata.to;
  if (Array.isArray(to) && to.length > 0) {
    chips.push(`to: ${to.join(", ")}`);
  }

  const missingItems = metadata.missingItems;
  if (Array.isArray(missingItems) && missingItems.length > 0) {
    chips.push(`missing: ${missingItems.length}`);
  }

  return chips.slice(0, 6);
}

function transactionLabel(event: AgentActivityEvent) {
  if (!event.transactionId) {
    return "No transaction yet";
  }

  return event.transaction?.propertyAddress ?? "View transaction";
}

export function ActivityDebugger({
  events,
  emptyText = "No agent activity has been recorded yet.",
  showTransactionLinks = false,
  title = "Agent Activity",
  eyebrow = "Developer debugger"
}: {
  events: AgentActivityEvent[];
  emptyText?: string;
  showTransactionLinks?: boolean;
  title?: string;
  eyebrow?: string;
}) {
  return (
    <section className="activity-debugger">
      <header className="activity-debugger-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span>{events.length} events</span>
      </header>

      {events.length === 0 ? (
        <p className="empty-state">{emptyText}</p>
      ) : (
        <ol className="activity-timeline">
          {events.map((event) => {
            const chips = metadataChips(event);

            return (
              <li className={`activity-item status-${event.status}`} key={event.id}>
                <div className="activity-dot" aria-hidden="true" />
                <article className="activity-card">
                  <div className="activity-card-topline">
                    <time dateTime={event.occurredAt}>
                      {formatTimestamp(event.occurredAt)}
                    </time>
                    <div className="activity-badges">
                      <span className="activity-badge">{event.sourceType}</span>
                      <span className={`activity-badge status-badge status-${event.status}`}>
                        {event.status}
                      </span>
                      {event.isSynthetic ? (
                        <span className="activity-badge synthetic-badge">
                          derived history
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <h3>{event.title}</h3>
                  <p>{event.summary}</p>

                  {showTransactionLinks ? (
                    <div className="activity-transaction-link">
                      {event.transactionId ? (
                        <Link href={`/transactions/${event.transactionId}`}>
                          {transactionLabel(event)}
                        </Link>
                      ) : (
                        <span>No transaction yet</span>
                      )}
                      {event.transaction?.status ? (
                        <small>{event.transaction.status}</small>
                      ) : null}
                    </div>
                  ) : null}

                  {chips.length > 0 ? (
                    <div className="activity-chips">
                      {chips.map((chip) => (
                        <span key={chip}>{chip}</span>
                      ))}
                    </div>
                  ) : null}

                  <details className="activity-debug-details">
                    <summary>Debug metadata</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          id: event.id,
                          eventType: event.eventType,
                          sourceType: event.sourceType,
                          status: event.status,
                          transactionId: event.transactionId,
                          transaction: event.transaction,
                          agentDecisionId: event.agentDecisionId,
                          debugSource: event.debugSource,
                          metadata: event.metadata
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
