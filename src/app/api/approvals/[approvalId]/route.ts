import { NextResponse } from "next/server";
import { safeBodyPreview } from "@/lib/agent/activity";
import { sendTcEmail } from "@/lib/agentmail/service";
import {
  createAgentActivityEvent,
  updateApprovalStatus
} from "@/lib/db/repositories";

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

  await createAgentActivityEvent({
    teamId: approval.team_id,
    transactionId: approval.transaction_id,
    sourceType: "approval",
    eventType: body.action === "approve" ? "approval_approved" : "approval_rejected",
    title: body.action === "approve" ? "Approval accepted" : "Approval rejected",
    summary: `${approval.proposed_subject} was ${body.action === "approve" ? "approved" : "rejected"}.`,
    status: body.action === "approve" ? "completed" : "blocked",
    metadata: {
      approvalId: approval.id,
      subject: approval.proposed_subject,
      to: approval.proposed_to,
      cc: approval.proposed_cc,
      bodyPreview: safeBodyPreview(approval.proposed_body)
    }
  });

  if (body.action === "approve") {
    await sendTcEmail({
      inboxId: approval.inbox_id,
      to: approval.proposed_to,
      cc: approval.proposed_cc,
      subject: approval.proposed_subject,
      text: approval.proposed_body,
      labels: ["approved-send"]
    });
    await createAgentActivityEvent({
      teamId: approval.team_id,
      transactionId: approval.transaction_id,
      sourceType: "email",
      eventType: "approved_email_sent",
      title: "Sent approved email",
      summary: `Sent approved email "${approval.proposed_subject}" to ${approval.proposed_to.join(", ")}.`,
      status: "sent",
      metadata: {
        approvalId: approval.id,
        subject: approval.proposed_subject,
        to: approval.proposed_to,
        cc: approval.proposed_cc,
        labels: ["approved-send"],
        bodyPreview: safeBodyPreview(approval.proposed_body)
      }
    });
  }

  return NextResponse.json({ ok: true, status: body.action });
}
