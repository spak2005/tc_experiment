import {
  createAgentActivityEvent,
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
    await createAgentActivityEvent({
      teamId: milestone.team_id,
      transactionId: milestone.transaction_id,
      sourceType: "deadline",
      eventType: "at_risk_milestone_found",
      title: "Found at-risk deadline",
      summary: `${milestone.title} is due on ${milestone.due_date}.`,
      status: "started",
      metadata: {
        milestoneId: milestone.milestone_id,
        title: milestone.title,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      }
    });
    const blocker = await createBlocker({
      transactionId: milestone.transaction_id,
      title: `Deadline at risk: ${milestone.title}`,
      details: `${milestone.title} is due on ${milestone.due_date}. The TC should confirm completion or escalate.`,
      riskLevel: milestone.risk_level === "critical" ? "critical" : "urgent",
      deadlineId: milestone.milestone_id
    });
    await createAgentActivityEvent({
      teamId: milestone.team_id,
      transactionId: milestone.transaction_id,
      sourceType: "deadline",
      eventType: "deadline_blocker_created",
      title: "Created deadline blocker",
      summary: `Created a blocker for ${milestone.title}.`,
      status: "completed",
      metadata: {
        milestoneId: milestone.milestone_id,
        blockerId: blocker.id,
        title: milestone.title,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      }
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
    await createAgentActivityEvent({
      teamId: milestone.team_id,
      transactionId: milestone.transaction_id,
      sourceType: "deadline",
      eventType: "deadline_escalation_sent",
      title: "Sent deadline escalation",
      summary: `Escalated ${milestone.title} to ${milestone.escalation_email}.`,
      status: "sent",
      metadata: {
        milestoneId: milestone.milestone_id,
        blockerId: blocker.id,
        to: [milestone.escalation_email],
        subject: escalation.subject,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      }
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
