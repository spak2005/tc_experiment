import Link from "next/link";
import type { AgentActivityEvent } from "@/lib/agent/activity";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short"
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

function newestFirst(events: AgentActivityEvent[]) {
  return [...events].sort((left, right) => {
    const timeComparison =
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();

    if (timeComparison !== 0) {
      return timeComparison;
    }

    return right.id.localeCompare(left.id);
  });
}

function oldestFirst(events: AgentActivityEvent[]) {
  return newestFirst(events).reverse();
}

type ActivityGroup = {
  id: string;
  title: string;
  workflowType: string;
  summary: string;
  status: AgentActivityEvent["status"];
  startedAt: string;
  completedAt?: string;
  transaction?: AgentActivityEvent["transaction"];
  transactionId?: string;
  events: AgentActivityEvent[];
  isFallback: boolean;
};

function fallbackKey(event: AgentActivityEvent) {
  const metadata = event.metadata;
  const threadId = typeof metadata.threadId === "string" ? metadata.threadId : undefined;
  const messageId = typeof metadata.messageId === "string" ? metadata.messageId : undefined;

  return event.transactionId ?? threadId ?? messageId ?? "unscoped";
}

function groupStatus(events: AgentActivityEvent[]): AgentActivityEvent["status"] {
  if (events.some((event) => event.status === "failed")) return "failed";
  if (events.some((event) => event.status === "blocked")) return "blocked";
  if (events.some((event) => event.status === "waiting")) return "waiting";
  if (events.some((event) => event.status === "sent")) return "sent";
  if (events.every((event) => event.status === "ignored")) return "ignored";
  if (events.some((event) => event.status === "started")) return "started";
  if (events.some((event) => event.status === "received")) return "received";
  return "completed";
}

function minutesBetween(left: string, right: string) {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 60_000;
}

function buildFallbackGroups(events: AgentActivityEvent[]) {
  const groups: ActivityGroup[] = [];
  const openByKey = new Map<string, ActivityGroup>();

  for (const event of oldestFirst(events)) {
    const key = fallbackKey(event);
    const previous = openByKey.get(key);
    const shouldReuse =
      previous &&
      minutesBetween(previous.events[previous.events.length - 1].occurredAt, event.occurredAt) <=
        10;
    const group = shouldReuse
      ? previous
      : {
          id: `fallback:${key}:${event.id}`,
          title: "Legacy activity",
          workflowType: "legacy_activity",
          summary: "Older activity without a durable workflow run.",
          status: event.status,
          startedAt: event.occurredAt,
          completedAt: event.occurredAt,
          transaction: event.transaction,
          transactionId: event.transactionId,
          events: [],
          isFallback: true
        };

    if (!shouldReuse) {
      groups.push(group);
      openByKey.set(key, group);
    }

    group.events.push(event);
    group.status = groupStatus(group.events);
    group.completedAt = event.occurredAt;
    group.transaction = group.transaction ?? event.transaction;
    group.transactionId = group.transactionId ?? event.transactionId;
  }

  return groups;
}

function groupActivityEvents(events: AgentActivityEvent[]) {
  const byRun = new Map<string, ActivityGroup>();
  const fallbackEvents: AgentActivityEvent[] = [];

  for (const event of events) {
    const run = event.activityRun;
    if (!run) {
      fallbackEvents.push(event);
      continue;
    }

    const existing = byRun.get(run.id);
    if (existing) {
      existing.events.push(event);
      continue;
    }

    byRun.set(run.id, {
      id: run.id,
      title: run.title,
      workflowType: String(run.workflowType),
      summary: run.summary,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      transaction: run.transaction,
      transactionId: run.transactionId,
      events: [event],
      isFallback: false
    });
  }

  const groups = [...byRun.values(), ...buildFallbackGroups(fallbackEvents)];

  return groups
    .map((group) => ({
      ...group,
      events: newestFirst(group.events)
    }))
    .sort((left, right) => {
      const leftTime = new Date(left.completedAt ?? left.startedAt).getTime();
      const rightTime = new Date(right.completedAt ?? right.startedAt).getTime();
      return rightTime - leftTime || right.id.localeCompare(left.id);
    });
}

function formatDuration(startedAt: string, completedAt?: string) {
  if (!completedAt) return "in progress";
  const seconds = Math.max(
    0,
    Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function ActivityEventCard({
  event,
  showTransactionLinks
}: {
  event: AgentActivityEvent;
  showTransactionLinks: boolean;
}) {
  const chips = metadataChips(event);

  return (
    <li className={`activity-item status-${event.status}`} key={event.id}>
      <div className="activity-dot" aria-hidden="true" />
      <article className="activity-card">
        <div className="activity-card-topline">
          <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
          <div className="activity-badges">
            <span className="activity-badge">{event.sourceType}</span>
            <span className={`activity-badge status-badge status-${event.status}`}>
              {event.status}
            </span>
            {event.isSynthetic ? (
              <span className="activity-badge synthetic-badge">derived history</span>
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
            {event.transaction?.status ? <small>{event.transaction.status}</small> : null}
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
                activityRunId: event.activityRunId,
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
}

function ActivityGroups({
  events,
  showTransactionLinks
}: {
  events: AgentActivityEvent[];
  showTransactionLinks: boolean;
}) {
  const groups = groupActivityEvents(events);

  return (
    <ol className="activity-run-list">
      {groups.map((group) => (
        <li className={`activity-run status-${group.status}`} key={group.id}>
          <details className="activity-run-details">
            <summary className="activity-run-summary">
              <div>
                <div className="activity-run-topline">
                  <time dateTime={group.startedAt}>{formatTimestamp(group.startedAt)}</time>
                  <span>{formatDuration(group.startedAt, group.completedAt)}</span>
                </div>
                <h3>{group.title}</h3>
                <p>{group.summary || `${group.events.length} event workflow.`}</p>
                {showTransactionLinks ? (
                  <div className="activity-transaction-link">
                    {group.transactionId ? (
                      <Link href={`/transactions/${group.transactionId}`}>
                        {group.transaction?.propertyAddress ?? "View transaction"}
                      </Link>
                    ) : (
                      <span>No transaction yet</span>
                    )}
                    {group.transaction?.status ? <small>{group.transaction.status}</small> : null}
                  </div>
                ) : null}
              </div>
              <div className="activity-run-meta">
                <span className={`activity-badge status-badge status-${group.status}`}>
                  {group.status}
                </span>
                <span className="activity-badge">{group.workflowType}</span>
                <span className="activity-badge">{group.events.length} events</span>
                {group.isFallback ? (
                  <span className="activity-badge synthetic-badge">fallback group</span>
                ) : null}
              </div>
            </summary>
            <ol className="activity-timeline activity-run-events">
              {group.events.map((event) => (
                <ActivityEventCard
                  event={event}
                  key={event.id}
                  showTransactionLinks={showTransactionLinks}
                />
              ))}
            </ol>
          </details>
        </li>
      ))}
    </ol>
  );
}

export function ActivityDebugger({
  events,
  emptyText = "No agent activity has been recorded yet.",
  showTransactionLinks = false,
  showWorkflowGroups = false,
  title = "Agent Activity",
  eyebrow = "Developer debugger"
}: {
  events: AgentActivityEvent[];
  emptyText?: string;
  showTransactionLinks?: boolean;
  showWorkflowGroups?: boolean;
  title?: string;
  eyebrow?: string;
}) {
  const renderedEvents = newestFirst(events);

  return (
    <section className="activity-debugger">
      <header className="activity-debugger-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span>{renderedEvents.length} events · newest first</span>
      </header>

      {renderedEvents.length === 0 ? (
        <p className="empty-state">{emptyText}</p>
      ) : showWorkflowGroups ? (
        <ActivityGroups events={events} showTransactionLinks={showTransactionLinks} />
      ) : (
        <ol className="activity-timeline">
          {renderedEvents.map((event) => (
            <ActivityEventCard
              event={event}
              key={event.id}
              showTransactionLinks={showTransactionLinks}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
