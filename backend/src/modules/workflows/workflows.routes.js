const express = require("express");
const { authenticate, requireAdmin, isAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const { getDocumentWithAccess, assertMinAccess } = require("../documents/document-access.service");
const { createNotification, notifyRoleUsers } = require("../notifications/notifications.service");
const { ensureDefaultWorkflows } = require("./workflows.defaults.service");

const router = express.Router();

async function notifyStepAssignees({ stepId, documentId, title, message }) {
  if (!stepId) return;
  const step = await query(
    `SELECT id, assignee_type, assignee_id
     FROM workflow_steps
     WHERE id = ?`,
    [stepId]
  );
  if (!step.rows.length) return;
  const s = step.rows[0];
  const link = `/documents/${documentId}?tab=workflow`;
  if (s.assignee_type === "user") {
    await createNotification({
      userId: Number(s.assignee_id),
      type: "workflow",
      title,
      message,
      link,
    });
  } else if (s.assignee_type === "role") {
    await notifyRoleUsers({
      roleId: Number(s.assignee_id),
      type: "workflow",
      title,
      message,
      link,
    });
  }
}

function dueDateExpr(hours) {
  const h = Number(hours || 0);
  if (!Number.isFinite(h) || h <= 0) return null;
  return h;
}

function readStepField(step, camelName, snakeName) {
  if (step[camelName] !== undefined) return step[camelName];
  return step[snakeName];
}

function normalizeTemplateStep(step, index) {
  const assigneeType = readStepField(step, "assigneeType", "assignee_type");
  const assigneeIdRaw =
    assigneeType === "role"
      ? step.role_id ?? step.roleId ?? readStepField(step, "assigneeId", "assignee_id")
      : step.user_id ?? step.userId ?? readStepField(step, "assigneeId", "assignee_id");
  const assigneeId = Number(assigneeIdRaw);

  return {
    stepOrder: Number(readStepField(step, "stepOrder", "step_order") || index + 1),
    assigneeType,
    assigneeId,
    dueHours: Number(readStepField(step, "dueHours", "due_hours") || 0),
    reminderHours: Number(readStepField(step, "reminderHours", "reminder_hours") || 0),
  };
}

async function assertTemplateStepAssignee(step) {
  if (!["role", "user"].includes(step.assigneeType)) {
    const err = new Error("Invalid workflow assignee type");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(step.assigneeId) || step.assigneeId <= 0) {
    const err = new Error("Invalid workflow assignee id");
    err.statusCode = 400;
    throw err;
  }

  const table = step.assigneeType === "role" ? "roles" : "users";
  const exists = await query(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [step.assigneeId]);
  if (exists.rowCount === 0) {
    const err = new Error(
      step.assigneeType === "role" ? "Workflow role assignee not found" : "Workflow user assignee not found"
    );
    err.statusCode = 400;
    throw err;
  }
}

function isStepAssignedToUser(step, user) {
  if (!step || !user) return false;
  if (step.assignee_type === "user") {
    return String(step.assignee_id) === String(user.id);
  }
  if (step.assignee_type === "role") {
    return (user.roleIds || []).some((roleId) => String(roleId) === String(step.assignee_id));
  }
  return false;
}

async function notifyDocumentOwnerForWorkflow({ ownerId, documentId, documentTitle, action, comment }) {
  if (!ownerId || !documentId) return;
  const link = `/documents/${documentId}?tab=workflow`;
  const safeTitle = documentTitle || "Sans titre";
  const meta = comment ? ` Commentaire : ${comment}` : "";
  const copy = {
    approve: {
      title: "Workflow approuvé",
      message: `Le workflow du document « ${safeTitle} » est approuvé.${meta}`,
    },
    reject: {
      title: "Workflow rejeté",
      message: `Le workflow du document « ${safeTitle} » a été rejeté.${meta}`,
    },
    request_changes: {
      title: "Modifications demandées",
      message: `Des modifications sont demandées sur le document « ${safeTitle} ».${meta}`,
    },
  }[action];
  if (!copy) return;
  await createNotification({
    userId: Number(ownerId),
    type: "workflow",
    title: copy.title,
    message: copy.message,
    link,
  });
}

/** Autorise admin ou le destinataire de l’étape courante (utilisateur / rôle). */
async function assertWorkflowActor(req, res, next) {
  try {
    const result = await query(
      `SELECT wi.id, wi.status, ws.assignee_type, ws.assignee_id
       FROM workflow_instances wi
       LEFT JOIN workflow_steps ws ON ws.id = wi.current_step_id
       WHERE wi.id = ?
       LIMIT 1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Workflow instance not found" });
    }
    const step = result.rows[0];
    if (step.status !== "pending") {
      return res.status(409).json({ success: false, message: "Workflow instance is not pending" });
    }
    if (isAdmin(req.user) || isStepAssignedToUser(step, req.user)) {
      return next();
    }
    return res.status(403).json({ success: false, message: "Not authorized for this workflow step" });
  } catch (e) {
    return next(e);
  }
}

router.get("/templates", authenticate, async (req, res, next) => {
  try {
    await ensureDefaultWorkflows();
    const templates = await query(
      `SELECT w.*,
              (SELECT COUNT(*) FROM workflow_steps ws WHERE ws.workflow_id = w.id) AS steps_count
       FROM workflows w
       WHERE COALESCE(w.is_visual, 0) = 0
       ORDER BY w.created_at DESC, w.id DESC`
    );
    const seen = new Set();
    const unique = templates.rows.filter((row) => {
      const key = String(row.name || "")
        .trim()
        .toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return res.json({ success: true, data: unique });
  } catch (error) {
    return next(error);
  }
});

router.post("/templates", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, description, documentCategory, steps = [] } = req.body;
    const created = await query(
      `INSERT INTO workflows (name, description, document_category)
       VALUES (?, ?, ?)`,
      [name, description || null, documentCategory || null]
    );
    const workflowId = created.rows.insertId;
    for (let i = 0; i < steps.length; i += 1) {
      const step = normalizeTemplateStep(steps[i], i);
      await assertTemplateStepAssignee(step);
      await query(
        `INSERT INTO workflow_steps (workflow_id, step_order, assignee_type, assignee_id, due_hours, reminder_hours)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workflowId,
          step.stepOrder,
          step.assigneeType,
          step.assigneeId,
          step.dueHours,
          step.reminderHours,
        ]
      );
    }
    return res.status(201).json({ success: true, data: { id: workflowId } });
  } catch (error) {
    return next(error);
  }
});

router.put("/templates/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const workflowId = Number(req.params.id);
    const existing = await query(`SELECT id FROM workflows WHERE id = ? LIMIT 1`, [workflowId]);
    if (!existing.rowCount) {
      return res.status(404).json({ success: false, message: "Modèle de workflow introuvable" });
    }
    const { name, description, documentCategory, steps = [] } = req.body;
    await query(
      `UPDATE workflows
       SET name = ?, description = ?, document_category = ?
       WHERE id = ?`,
      [name, description || null, documentCategory || null, workflowId]
    );
    await query("DELETE FROM workflow_steps WHERE workflow_id = ?", [workflowId]);
    for (let i = 0; i < steps.length; i += 1) {
      const step = normalizeTemplateStep(steps[i], i);
      await assertTemplateStepAssignee(step);
      await query(
        `INSERT INTO workflow_steps (workflow_id, step_order, assignee_type, assignee_id, due_hours, reminder_hours)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workflowId,
          step.stepOrder,
          step.assigneeType,
          step.assigneeId,
          step.dueHours,
          step.reminderHours,
        ]
      );
    }
    return res.json({ success: true, message: "Workflow template updated" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/templates/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const workflowId = Number(req.params.id);
    const existing = await query(`SELECT id, name FROM workflows WHERE id = ? LIMIT 1`, [workflowId]);
    if (!existing.rowCount) {
      return res.status(404).json({ success: false, message: "Modèle de workflow introuvable" });
    }
    const instances = await query(
      `SELECT COUNT(*) AS c FROM workflow_instances WHERE workflow_id = ?`,
      [workflowId]
    );
    const instanceCount = Number(instances.rows[0]?.c || 0);
    if (instanceCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Ce modèle est utilisé par ${instanceCount} instance(s) de workflow. Terminez-les ou choisissez un autre modèle avant suppression.`,
      });
    }
    await query("DELETE FROM workflows WHERE id = ?", [workflowId]);
    return res.json({ success: true, message: "Modèle de workflow supprimé" });
  } catch (error) {
    return next(error);
  }
});

router.get("/templates/:id/steps", authenticate, async (req, res, next) => {
  try {
    const steps = await query(
      `SELECT id, workflow_id, step_order, assignee_type, assignee_id, due_hours, reminder_hours
       FROM workflow_steps
       WHERE workflow_id = ?
       ORDER BY step_order ASC`,
      [req.params.id]
    );
    return res.json({ success: true, data: steps.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/start", authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.body;
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "manage")) {
      return res.status(403).json({
        success: false,
        message: "Propriétaire ou permission « manage » sur le document requise pour démarrer un workflow",
      });
    }
    const firstStep = await query(
      `SELECT id, due_hours
       FROM workflow_steps
       WHERE workflow_id = ?
       ORDER BY step_order ASC
       LIMIT 1`,
      [req.params.id]
    );
    if (firstStep.rowCount === 0) {
      return res.status(400).json({ success: false, message: "Workflow has no steps" });
    }

    const firstDueHours = dueDateExpr(firstStep.rows[0].due_hours);
    const insert = firstDueHours
      ? await query(
          `INSERT INTO workflow_instances (document_id, workflow_id, current_step_id, status, started_at, due_date, reminder_sent_at)
           VALUES (?, ?, ?, 'pending', NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR), NULL)`,
          [documentId, req.params.id, firstStep.rows[0].id, firstDueHours]
        )
      : await query(
          `INSERT INTO workflow_instances (document_id, workflow_id, current_step_id, status, started_at, due_date, reminder_sent_at)
           VALUES (?, ?, ?, 'pending', NOW(), NULL, NULL)`,
          [documentId, req.params.id, firstStep.rows[0].id]
        );
    await query("UPDATE documents SET status = 'in_review' WHERE id = ?", [documentId]);
    await query(
      `INSERT INTO workflow_actions (instance_id, step_id, actor_id, action, comment)
       VALUES (?, ?, ?, 'start', ?)`,
      [insert.rows.insertId, firstStep.rows[0].id, req.user.id, req.body.comment || null]
    );
    await logAudit({
      actorId: req.user.id,
      action: "workflow.instance.start",
      entityType: "workflow_instance",
      entityId: String(insert.rows.insertId),
      metadata: { documentId, workflowId: Number(req.params.id) },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });
    await notifyStepAssignees({
      stepId: firstStep.rows[0].id,
      documentId,
      title: "Étape workflow assignée",
      message: "Une nouvelle étape de workflow vous est assignée.",
    });
    return res.status(201).json({ success: true, data: { id: insert.rows.insertId } });
  } catch (error) {
    return next(error);
  }
});

router.get("/instances", authenticate, async (req, res, next) => {
  try {
    const status = req.query.status || "pending";
    if (status === "approved") {
      const requestedUserId = req.query.userId ? Number(req.query.userId) : req.user.id;
      const actorId = isAdmin(req.user) && Number.isFinite(requestedUserId) ? requestedUserId : req.user.id;
      const approved = await query(
        `SELECT DISTINCT wi.id, wi.document_id, wi.workflow_id, wi.current_step_id, wi.status,
                wi.started_at, wi.completed_at, wi.due_date,
                d.title AS document_title, w.name AS workflow_name
         FROM workflow_instances wi
         JOIN workflow_actions wa ON wa.instance_id = wi.id
         JOIN documents d ON d.id = wi.document_id
         JOIN workflows w ON w.id = wi.workflow_id
         WHERE wi.status = 'approved'
           AND wa.actor_id = ?
           AND wa.action = 'approve'
         ORDER BY wi.completed_at DESC, wi.started_at DESC`,
        [actorId]
      );
      return res.json({ success: true, data: approved.rows });
    }

    const myRoles = req.user.roles || [];
    const placeholders = myRoles.length > 0 ? myRoles.map(() => "?").join(",") : "''";
    const params = [status, req.user.id, ...myRoles];
    const sql = `SELECT wi.id, wi.document_id, wi.workflow_id, wi.current_step_id, wi.status, wi.started_at, wi.completed_at, wi.due_date,
                        d.title AS document_title, ws.step_order, ws.assignee_type, ws.assignee_id,
                        CASE
                          WHEN ws.assignee_type = 'user' THEN assignee_user.full_name
                          WHEN ws.assignee_type = 'role' THEN assignee_role.name
                          ELSE NULL
                        END AS assignee_label,
                        w.name AS workflow_name
                 FROM workflow_instances wi
                 JOIN documents d ON d.id = wi.document_id
                 JOIN workflows w ON w.id = wi.workflow_id
                 LEFT JOIN workflow_steps ws ON ws.id = wi.current_step_id
                 LEFT JOIN users assignee_user ON ws.assignee_type = 'user' AND assignee_user.id = ws.assignee_id
                 LEFT JOIN roles assignee_role ON ws.assignee_type = 'role' AND assignee_role.id = ws.assignee_id
                 WHERE wi.status = ?
                   AND (
                     (ws.assignee_type = 'user' AND ws.assignee_id = ?)
                     OR (ws.assignee_type = 'role' AND ws.assignee_id IN (
                       SELECT id FROM roles WHERE name IN (${placeholders})
                     ))
                   )
                 ORDER BY wi.started_at DESC`;
    const instances = await query(sql, params);
    return res.json({ success: true, data: instances.rows });
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/instances/by-document/:documentId",
  authenticate,
  async (req, res, next) => {
    try {
      const ctx = await getDocumentWithAccess(req.user, req.params.documentId);
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      if (!assertMinAccess(ctx.access, "view")) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      const timeline = await query(
        `SELECT wa.id, wa.instance_id, wa.step_id, wa.actor_id, wa.action, wa.comment, wa.created_at,
                u.full_name AS actor_name, ws.step_order
         FROM workflow_actions wa
         LEFT JOIN users u ON u.id = wa.actor_id
         LEFT JOIN workflow_steps ws ON ws.id = wa.step_id
         WHERE wa.instance_id IN (
           SELECT id FROM workflow_instances WHERE document_id = ?
         )
         ORDER BY wa.created_at ASC`,
        [req.params.documentId]
      );
      const instances = await query(
        `SELECT wi.id, wi.document_id, wi.workflow_id, wi.current_step_id, wi.current_node_id,
                wi.status,
                wi.started_at, wi.completed_at, wi.due_date,
                w.name AS workflow_name,
                ws.step_order, ws.assignee_type, ws.assignee_id,
                CASE
                  WHEN ws.assignee_type = 'user' THEN assignee_user.full_name
                  WHEN ws.assignee_type = 'role' THEN assignee_role.name
                  ELSE NULL
                END AS assignee_label
         FROM workflow_instances wi
         JOIN workflows w ON w.id = wi.workflow_id
         LEFT JOIN workflow_steps ws ON ws.id = wi.current_step_id
         LEFT JOIN users assignee_user ON ws.assignee_type = 'user' AND assignee_user.id = ws.assignee_id
         LEFT JOIN roles assignee_role ON ws.assignee_type = 'role' AND assignee_role.id = ws.assignee_id
         WHERE wi.document_id = ?
         ORDER BY wi.started_at DESC`,
        [req.params.documentId]
      );
      const data = instances.rows.map((row) => ({
        ...row,
        can_act:
          row.status === "pending" &&
          (isAdmin(req.user) ||
            isStepAssignedToUser(
              { assignee_type: row.assignee_type, assignee_id: row.assignee_id },
              req.user
            )),
      }));
      return res.json({ success: true, data: { instances: data, timeline: timeline.rows } });
    } catch (error) {
      return next(error);
    }
  }
);

const handleWorkflowAction = (action) => async (req, res, next) => {
  try {
    const instance = await query(
      `SELECT wi.id, wi.document_id, wi.workflow_id, wi.current_step_id, wi.status,
              ws.step_order, d.owner_id, d.title AS document_title, w.name AS workflow_name
       FROM workflow_instances wi
       LEFT JOIN workflow_steps ws ON ws.id = wi.current_step_id
       JOIN documents d ON d.id = wi.document_id
       JOIN workflows w ON w.id = wi.workflow_id
       WHERE wi.id = ?`,
      [req.params.id]
    );
    if (instance.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Workflow instance not found" });
    }
    const current = instance.rows[0];
    if (current.status !== "pending") {
      return res.status(409).json({ success: false, message: "Workflow instance is not pending" });
    }
    const comment = req.body.comment || null;
    await query(
      `INSERT INTO workflow_actions (instance_id, step_id, actor_id, action, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, current.current_step_id, req.user.id, action, comment]
    );

    if (action === "approve") {
      const nextStep = await query(
        `SELECT id, due_hours
         FROM workflow_steps
         WHERE workflow_id = ?
           AND step_order > ?
         ORDER BY step_order ASC
         LIMIT 1`,
        [current.workflow_id, current.step_order || 0]
      );
      if (nextStep.rowCount > 0) {
        const nextDueHours = dueDateExpr(nextStep.rows[0].due_hours);
        if (nextDueHours) {
          await query(
            "UPDATE workflow_instances SET current_step_id = ?, status = 'pending', due_date = DATE_ADD(NOW(), INTERVAL ? HOUR), reminder_sent_at = NULL WHERE id = ?",
            [nextStep.rows[0].id, nextDueHours, req.params.id]
          );
        } else {
          await query(
            "UPDATE workflow_instances SET current_step_id = ?, status = 'pending', due_date = NULL, reminder_sent_at = NULL WHERE id = ?",
            [nextStep.rows[0].id, req.params.id]
          );
        }
        await notifyStepAssignees({
          stepId: nextStep.rows[0].id,
          documentId: current.document_id,
          title: "Étape workflow assignée",
          message: "Une nouvelle étape de workflow vous est assignée.",
        });
      } else {
        await query(
          "UPDATE workflow_instances SET current_step_id = NULL, status = 'approved', completed_at = NOW(), due_date = NULL, reminder_sent_at = NULL WHERE id = ?",
          [req.params.id]
        );
        await query("UPDATE documents SET status = 'approved' WHERE id = ?", [current.document_id]);
        await notifyDocumentOwnerForWorkflow({
          ownerId: current.owner_id,
          documentId: current.document_id,
          documentTitle: current.document_title,
          action: "approve",
          comment,
        });
      }
    } else if (action === "reject") {
      await query(
        "UPDATE workflow_instances SET status = 'rejected', completed_at = NOW(), due_date = NULL, reminder_sent_at = NULL WHERE id = ?",
        [req.params.id]
      );
      await query("UPDATE documents SET status = 'rejected' WHERE id = ?", [current.document_id]);
      await notifyDocumentOwnerForWorkflow({
        ownerId: current.owner_id,
        documentId: current.document_id,
        documentTitle: current.document_title,
        action: "reject",
        comment,
      });
    } else if (action === "request_changes") {
      await query(
        "UPDATE workflow_instances SET status = 'changes_requested', completed_at = NOW(), due_date = NULL, reminder_sent_at = NULL WHERE id = ?",
        [req.params.id]
      );
      await query("UPDATE documents SET status = 'changes_requested' WHERE id = ?", [current.document_id]);
      await notifyDocumentOwnerForWorkflow({
        ownerId: current.owner_id,
        documentId: current.document_id,
        documentTitle: current.document_title,
        action: "request_changes",
        comment,
      });
    }

    await logAudit({
      actorId: req.user.id,
      action: `workflow.instance.${action}`,
      entityType: "workflow_instance",
      entityId: String(req.params.id),
      metadata: {
        documentId: Number(current.document_id),
        workflowId: Number(current.workflow_id),
        stepId: current.current_step_id ? Number(current.current_step_id) : null,
        comment,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.json({ success: true, message: `Action ${action} applied` });
  } catch (error) {
    return next(error);
  }
};

router.post("/instances/:id/approve", authenticate, assertWorkflowActor, handleWorkflowAction("approve"));
router.post("/instances/:id/reject", authenticate, assertWorkflowActor, handleWorkflowAction("reject"));
router.post(
  "/instances/:id/request-changes",
  authenticate,
  assertWorkflowActor,
  handleWorkflowAction("request_changes")
);

module.exports = router;
