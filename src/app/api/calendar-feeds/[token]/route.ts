import { buildTransactionCalendarIcs } from "@/lib/calendar/ics";
import {
  getCalendarFeedByToken,
  markCalendarFeedAccessed
} from "@/lib/db/repositories";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const feed = await getCalendarFeedByToken(token);

  if (!feed) {
    return new Response("Not found", { status: 404 });
  }

  const ics = buildTransactionCalendarIcs({
    transaction: feed.transaction,
    milestones: feed.milestones
  });

  await markCalendarFeedAccessed(token);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": `inline; filename="transaction-${feed.transaction.id}.ics"`,
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
