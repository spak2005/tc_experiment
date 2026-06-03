import { runWithActivityRun } from "@/lib/agent/activity-run-context";
import {
  createAgentActivityEvent,
  createAgentActivityRun,
  createAuditEvent,
  createOrGetOpenDeadlineBlocker,
  createOrGetOpenTaskBlocker,
  findAtRiskMilestones,
  findStaleResponseTasks,
  updateAgentActivityRun
} from "@/lib/db/repositories";
import { agentEscalationEmail } from "@/lib/email/templates";
import { sendTcEmailOnce } from "@/lib/agentmail/service";
import { getTemporalContext } from "@/lib/time/clock";

export async function checkDeadlineRisk() {
  const temporalContext = getTemporalContext();
  const atRisk = await findAtRiskMilestones(2, temporalContext.today);
  const staleTasks = await findStaleResponseTasks(temporalContext.today);
  const results: Array<{ transactionId: string; blockerId: string }> = [];

  for (const milestone of atRisk) {
    const activityRun = await createAgentActivityRun({
      userId: milestone.user_id,
      transactionId: milestone.transaction_id,
      workflowType: "deadline_monitor",
      title: "Deadline escalation",
      summary: `${milestone.title} is due on ${milestone.due_date}.`,
      status: "started",
      metadata: {
        technicalType: "deadline_monitor",
        kind: "at_risk_milestone",
        milestoneId: milestone.milestone_id,
        title: milestone.title,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      }
    });
    await runWithActivityRun(activityRun.id, async () => {
      try {
    await createAgentActivityEvent({
      userId: milestone.user_id,
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
    const escalation = agentEscalationEmail({
      propertyAddress: milestone.property_address ?? "this transaction",
      deadlineTitle: milestone.title,
      dueDate: milestone.due_date,
      lastAttempts: 1,
      neededAction: "Please intervene or confirm this item is complete."
    });

    await sendTcEmailOnce({
      idempotencyKey: `deadline:${milestone.milestone_id}:escalation`,
      inboxId: milestone.inbox_id,
      to: [milestone.escalation_email],
      subject: escalation.subject,
      text: escalation.text,
      labels: ["escalation", milestone.risk_level]
    });
    await createAgentActivityEvent({
      userId: milestone.user_id,
      transactionId: milestone.transaction_id,
      sourceType: "deadline",
      eventType: "deadline_escalation_sent",
      title: "Sent deadline escalation",
      summary: `Escalated ${milestone.title} to ${milestone.escalation_email}.`,
      status: "sent",
      metadata: {
        milestoneId: milestone.milestone_id,
        to: [milestone.escalation_email],
        subject: escalation.subject,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      }
    });

    const blocker = await createOrGetOpenDeadlineBlocker({
      transactionId: milestone.transaction_id,
      title: `Deadline at risk: ${milestone.title}`,
      details: `${milestone.title} is due on ${milestone.due_date}. The TC should confirm completion or escalate.`,
      riskLevel: milestone.risk_level === "critical" ? "critical" : "urgent",
      deadlineId: milestone.milestone_id
    });
    await createAgentActivityEvent({
      userId: milestone.user_id,
      transactionId: milestone.transaction_id,
      sourceType: "deadline",
      eventType: "deadline_blocker_created",
      title: blocker.inserted ? "Created deadline blocker" : "Reused deadline blocker",
      summary: `${blocker.inserted ? "Created" : "Reused"} a blocker for ${milestone.title}.`,
      status: "completed",
      metadata: {
        milestoneId: milestone.milestone_id,
        blockerId: blocker.id,
        inserted: blocker.inserted,
        title: milestone.title,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      }
    });

    await createAuditEvent({
      userId: milestone.user_id,
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
    await updateAgentActivityRun({
      id: activityRun.id,
      title: "Deadline escalation",
      summary: `Escalated ${milestone.title} and ${blocker.inserted ? "created" : "reused"} a blocker.`,
      status: "sent",
      metadata: {
        technicalType: "deadline_monitor",
        kind: "at_risk_milestone",
        milestoneId: milestone.milestone_id,
        blockerId: blocker.id,
        inserted: blocker.inserted,
        title: milestone.title,
        dueDate: milestone.due_date,
        riskLevel: milestone.risk_level
      },
      completedAt: new Date()
    });
      } catch (error) {
        await updateAgentActivityRun({
          id: activityRun.id,
          title: "Deadline escalation",
          summary:
            error instanceof Error
              ? `Deadline escalation failed: ${error.message}`
              : "Deadline escalation failed.",
          status: "failed",
          metadata: {
            technicalType: "deadline_monitor",
            kind: "at_risk_milestone",
            milestoneId: milestone.milestone_id,
            title: milestone.title,
            dueDate: milestone.due_date,
            riskLevel: milestone.risk_level,
            error: error instanceof Error ? error.message : "Unknown error"
          },
          completedAt: new Date()
        });
        throw error;
      }
    });
  }

  for (const task of staleTasks) {
    const activityRun = await createAgentActivityRun({
      userId: task.user_id,
      transactionId: task.transaction_id,
      workflowType: "deadline_monitor",
      title: "Stale-response escalation",
      summary: `${task.title} has been waiting since ${task.follow_up_due_date}.`,
      status: "started",
      metadata: {
        technicalType: "deadline_monitor",
        kind: "stale_response",
        taskId: task.task_id,
        title: task.title,
        ownerRole: task.owner_role,
        followUpDueDate: task.follow_up_due_date
      }
    });
    await runWithActivityRun(activityRun.id, async () => {
      try {
    await createAgentActivityEvent({
      userId: task.user_id,
      transactionId: task.transaction_id,
      sourceType: "deadline",
      eventType: "stale_response_task_found",
      title: "Found stale response task",
      summary: `${task.title} has been waiting since ${task.follow_up_due_date}.`,
      status: "started",
      metadata: {
        taskId: task.task_id,
        title: task.title,
        ownerRole: task.owner_role,
        followUpDueDate: task.follow_up_due_date
      }
    });
    const escalation = agentEscalationEmail({
      propertyAddress: task.property_address ?? "this transaction",
      deadlineTitle: task.title,
      dueDate: task.follow_up_due_date,
      responsibleParty: task.owner_role,
      lastAttempts: 1,
      neededAction: "Please intervene or confirm this response has arrived."
    });

    await sendTcEmailOnce({
      idempotencyKey: `task:${task.task_id}:stale-escalation`,
      inboxId: task.inbox_id,
      to: [task.escalation_email],
      subject: escalation.subject,
      text: escalation.text,
      labels: ["escalation", "stale_response"]
    });
    await createAgentActivityEvent({
      userId: task.user_id,
      transactionId: task.transaction_id,
      sourceType: "deadline",
      eventType: "stale_response_escalation_sent",
      title: "Sent stale-response escalation",
      summary: `Escalated ${task.title} to ${task.escalation_email}.`,
      status: "sent",
      metadata: {
        taskId: task.task_id,
        to: [task.escalation_email],
        subject: escalation.subject,
        followUpDueDate: task.follow_up_due_date
      }
    });

    const blocker = await createOrGetOpenTaskBlocker({
      transactionId: task.transaction_id,
      title: `Stale response: ${task.title}`,
      details: `${task.title} is waiting on ${task.owner_role} and needs follow-up.`,
      riskLevel: "urgent",
      taskId: task.task_id
    });
    await createAgentActivityEvent({
      userId: task.user_id,
      transactionId: task.transaction_id,
      sourceType: "deadline",
      eventType: "stale_response_blocker_created",
      title: blocker.inserted ? "Created stale-response blocker" : "Reused stale-response blocker",
      summary: `${blocker.inserted ? "Created" : "Reused"} a blocker for ${task.title}.`,
      status: "completed",
      metadata: {
        taskId: task.task_id,
        blockerId: blocker.id,
        inserted: blocker.inserted,
        ownerRole: task.owner_role,
        followUpDueDate: task.follow_up_due_date
      }
    });

    await createAuditEvent({
      userId: task.user_id,
      transactionId: task.transaction_id,
      actor: "tc_agent",
      eventType: "stale_response_escalated",
      payload: {
        taskId: task.task_id,
        blockerId: blocker.id
      }
    });

    results.push({
      transactionId: task.transaction_id,
      blockerId: blocker.id
    });
    await updateAgentActivityRun({
      id: activityRun.id,
      title: "Stale-response escalation",
      summary: `Escalated ${task.title} and ${blocker.inserted ? "created" : "reused"} a blocker.`,
      status: "sent",
      metadata: {
        technicalType: "deadline_monitor",
        kind: "stale_response",
        taskId: task.task_id,
        blockerId: blocker.id,
        inserted: blocker.inserted,
        title: task.title,
        ownerRole: task.owner_role,
        followUpDueDate: task.follow_up_due_date
      },
      completedAt: new Date()
    });
      } catch (error) {
        await updateAgentActivityRun({
          id: activityRun.id,
          title: "Stale-response escalation",
          summary:
            error instanceof Error
              ? `Stale-response escalation failed: ${error.message}`
              : "Stale-response escalation failed.",
          status: "failed",
          metadata: {
            technicalType: "deadline_monitor",
            kind: "stale_response",
            taskId: task.task_id,
            title: task.title,
            ownerRole: task.owner_role,
            followUpDueDate: task.follow_up_due_date,
            error: error instanceof Error ? error.message : "Unknown error"
          },
          completedAt: new Date()
        });
        throw error;
      }
    });
  }

  return results;
}
