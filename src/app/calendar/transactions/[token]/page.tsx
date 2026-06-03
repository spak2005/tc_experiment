import { notFound } from "next/navigation";
import { buildPublicUrl } from "@/lib/config/urls";
import { getCalendarFeedByToken } from "@/lib/db/repositories";

export default async function CalendarSubscriptionPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const feed = await getCalendarFeedByToken(token);

  if (!feed) {
    notFound();
  }

  const feedUrl = buildPublicUrl(`/api/calendar-feeds/${encodeURIComponent(token)}`);
  const googleCalendarUrl = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";
  const datedMilestones = feed.milestones.filter((milestone) => milestone.dueDate);
  const property = feed.transaction.propertyAddress ?? "this transaction";

  return (
    <main className="calendar-subscribe-page">
      <section className="calendar-subscribe-panel">
        <p className="eyebrow">Stephanie's calendar feed</p>
        <h1>Add {property} deadlines to Google Calendar.</h1>
        <p className="lede compact">
          This private feed includes {datedMilestones.length} dated deadline
          {datedMilestones.length === 1 ? "" : "s"}. When Stephanie updates the
          transaction timeline, Google Calendar will pick up changes when it
          refreshes the subscribed calendar.
        </p>

        <div className="calendar-actions">
          <a className="pill-button dark" href={googleCalendarUrl}>
            Open Google Calendar
          </a>
          <a className="utility-link" href={feedUrl}>
            Download ICS
          </a>
        </div>

        <label className="calendar-feed-copy">
          <span>Calendar feed URL</span>
          <input readOnly value={feedUrl} />
        </label>

        <section className="calendar-steps" aria-label="Google Calendar steps">
          <h2>Google Calendar steps</h2>
          <ol>
            <li>Open Google Calendar on a computer.</li>
            <li>Choose Other calendars, then From URL.</li>
            <li>Paste the feed URL above and add the calendar.</li>
          </ol>
        </section>

        <section className="calendar-deadline-preview" aria-label="Deadline preview">
          <h2>Deadline preview</h2>
          <div className="rows">
            {datedMilestones.slice(0, 6).map((milestone) => (
              <article className="row" key={milestone.key}>
                <strong>{milestone.title}</strong>
                <span>
                  {milestone.dueDate} · {milestone.riskLevel}
                </span>
                <small>{milestone.sourceReference ?? milestone.phase}</small>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
