const express = require("express");
const { authenticate, requireAdmin, isAdmin } = require("../../middlewares/auth");
const { logAudit } = require("../audit/audit.service");
const { getDocumentWithAccess, assertMinAccess } = require("../documents/document-access.service");
const {
  createVisualWorkflow,
  saveVisualWorkflow,
  getVisualWorkflow,
  startVisualInstance,
  applyVisualAction,
} = require("./workflows.visual.service");

const router = express.Router();

router.post("/visual", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, description, documentCategory, definition } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const data = await createVisualWorkflow({
      name: name.trim(),
      description,
      documentCategory,
      definition,
    });
    await logAudit({
      actorId: req.user.id,
      action: "workflow.visual.create",
      entityType: "workflow",
      entityId: String(data.id),
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.get("/visual/:id", authenticate, async (req, res, next) => {
  try {
    const wf = await getVisualWorkflow(Number(req.params.id));
    if (!wf) return res.status(404).json({ success: false, message: "Workflow not found" });
    return res.json({ success: true, data: wf });
  } catch (error) {
    return next(error);
  }
});

router.put("/visual/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const workflowId = Number(req.params.id);
    const existing = await getVisualWorkflow(workflowId);
    if (!existing) return res.status(404).json({ success: false, message: "Workflow not found" });
    const { name, description, documentCategory, definition } = req.body;
    const data = await saveVisualWorkflow({
      id: workflowId,
      name: name ?? existing.name,
      description: description ?? existing.description,
      documentCategory: documentCategory ?? existing.document_category,
      definition: definition ?? existing.visual_definition,
    });
    await logAudit({
      actorId: req.user.id,
      action: "workflow.visual.update",
      entityType: "workflow",
      entityId: String(workflowId),
      ipAddress: req.ip,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post("/visual/:id/start", authenticate, async (req, res, next) => {
  try {
    const workflowId = Number(req.params.id);
    const { documentId, comment, context } = req.body;
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "manage")) {
      return res.status(403).json({ success: false, message: "Permission manage required" });
    }
    const result = await startVisualInstance({
      workflowId,
      documentId: Number(documentId),
      actorId: req.user.id,
      comment,
      context: context || {},
    });
    await logAudit({
      actorId: req.user.id,
      action: "workflow.visual.start",
      entityType: "workflow_instance",
      entityId: String(result.instanceId),
      metadata: { documentId: Number(documentId), workflowId },
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/visual/instances/:instanceId/action", authenticate, async (req, res, next) => {
  try {
    const { action, comment } = req.body;
    if (!["approve", "reject", "request_changes"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }
    const result = await applyVisualAction({
      instanceId: Number(req.params.instanceId),
      action,
      user: req.user,
      comment,
      isAdmin: isAdmin(req.user),
    });
    await logAudit({
      actorId: req.user.id,
      action: `workflow.visual.${action}`,
      entityType: "workflow_instance",
      entityId: String(req.params.instanceId),
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
});

module.exports = router;
