import { NextResponse } from "next/server";
import { safeBodyPreview } from "@/lib/agent/activity";
import { sendApprovedApproval } from "@/lib/approvals/executor";
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
    userId: approval.user_id,
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
    await sendApprovedApproval({ approval });
  }

  return NextResponse.json({ ok: true, status: body.action });
}
