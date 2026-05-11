import {
  createAuditEvent,
  createBlocker,
  findAtRiskMilestones
} from "@/lib/db/repositories";
import { agentEscalationEmail } from "@/lib/email/templates";
import { sendTcEmail } from "@/lib/agentmail/service";

export async function checkDeadlineRisk() {
  const atRisk = await findAtRiskMilestones(2);
  const results: Array<{ transactionId: string; blockerId: string }> = [];

  for (const milestone of atRisk) {
    const blocker = await createBlocker({
      transactionId: milestone.transaction_id,
      title: `Deadline at risk: ${milestone.title}`,
      details: `${milestone.title} is due on ${milestone.due_date}. The TC should confirm completion or escalate.`,
      riskLevel: milestone.risk_level === "critical" ? "critical" : "urgent",
      deadlineId: milestone.milestone_id
    });

    const escalation = agentEscalationEmail({
      propertyAddress: milestone.property_address ?? "this transaction",
      deadlineTitle: milestone.title,
      dueDate: milestone.due_date,
      lastAttempts: 1,
      neededAction: "Please intervene or confirm this item is complete."
    });

    await sendTcEmail({
      inboxId: milestone.inbox_id,
      to: [milestone.escalation_email],
      subject: escalation.subject,
      text: escalation.text,
      labels: ["escalation", milestone.risk_level]
    });

    await createAuditEvent({
      teamId: milestone.team_id,
      transactionId: milestone.transaction_id,
      actor: "tc_agent",
      eventType: "deadline_escalated",
      payload: {
        milestoneId: milestone.milestone_id,
        blockerId: blocker.id
      }
    });

    results.push({
      transactionId: milestone.transaction_id,
      blockerId: blocker.id
    });
  }

  return results;
}
