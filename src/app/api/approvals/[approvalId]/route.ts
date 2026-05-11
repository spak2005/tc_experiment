import { NextResponse } from "next/server";
import { sendTcEmail } from "@/lib/agentmail/service";
import { updateApprovalStatus } from "@/lib/db/repositories";

export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> }
) {
  const { approvalId } = await context.params;
  const body = (await request.json()) as { action?: string };

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "Invalid approval action" }, { status: 400 });
  }

  const approval = await updateApprovalStatus(
    approvalId,
    body.action === "approve" ? "approved" : "rejected"
  );

  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  if (body.action === "approve") {
    await sendTcEmail({
      inboxId: approval.inbox_id,
      to: approval.proposed_to,
      cc: approval.proposed_cc,
      subject: approval.proposed_subject,
      text: approval.proposed_body,
      labels: ["approved-send"]
    });
  }

  return NextResponse.json({ ok: true, status: body.action });
}
