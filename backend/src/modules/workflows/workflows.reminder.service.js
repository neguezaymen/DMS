const { query } = require("../../config/db");
const { createNotification, notifyRoleUsers } = require("../notifications/notifications.service");

async function notifyCurrentAssignee(instanceRow) {
  const link = `/documents/${instanceRow.document_id}?tab=workflow`;
  const title = "Relance workflow en retard";
  const message = `La tâche workflow pour le document « ${instanceRow.document_title} » a dépassé son échéance.`;
  if (instanceRow.assignee_type === "user") {
    await createNotification({
      userId: Number(instanceRow.assignee_id),
      type: "workflow",
      title,
      message,
      link,
    });
  } else if (instanceRow.assignee_type === "role") {
    await notifyRoleUsers({
      roleId: Number(instanceRow.assignee_id),
      type: "workflow",
      title,
      message,
      link,
    });
  }
}

async function runWorkflowReminderJob() {
  const overdue = await query(
    `SELECT wi.id, wi.document_id, wi.current_step_id, wi.due_date, ws.assignee_type, ws.assignee_id, d.title AS document_title
     FROM workflow_instances wi
     JOIN workflow_steps ws ON ws.id = wi.current_step_id
     JOIN documents d ON d.id = wi.document_id
     WHERE wi.status = 'pending'
       AND wi.current_step_id IS NOT NULL
       AND wi.due_date IS NOT NULL
       AND wi.due_date < NOW()
       AND (wi.reminder_sent_at IS NULL OR wi.reminder_sent_at < DATE_SUB(NOW(), INTERVAL 12 HOUR))`
  );

  for (const row of overdue.rows) {
    await notifyCurrentAssignee(row);
    await query("UPDATE workflow_instances SET reminder_sent_at = NOW() WHERE id = ?", [row.id]);
  }

  return { reminded: overdue.rows.length };
}

module.exports = { runWorkflowReminderJob };
