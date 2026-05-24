const { query } = require("../../config/db");
const { createNotification, notifyRoleUsers } = require("../notifications/notifications.service");

const AUTO_TYPES = new Set(["start", "notification", "delay", "condition"]);
const TERMINAL_REJECT_TYPES = new Set(["reject"]);

function parseDefinition(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeDefinition(def) {
  const nodes = Array.isArray(def?.nodes) ? def.nodes : [];
  const edges = Array.isArray(def?.edges) ? def.edges : [];
  return { version: def?.version || 1, nodes, edges };
}

function findStartNode(def) {
  return def.nodes.find((n) => n.type === "start") || def.nodes[0] || null;
}

function outgoingEdges(def, nodeId, sourceHandle) {
  return def.edges.filter((e) => {
    if (e.source !== nodeId) return false;
    if (!sourceHandle) return !e.sourceHandle || e.sourceHandle === "default";
    return e.sourceHandle === sourceHandle;
  });
}

function nextTarget(def, nodeId, sourceHandle) {
  const outs = outgoingEdges(def, nodeId, sourceHandle);
  return outs[0]?.target || null;
}

function getNode(def, nodeId) {
  return def.nodes.find((n) => n.id === nodeId) || null;
}

function evaluateCondition(data, context) {
  const field = String(data?.field || "amount").toLowerCase();
  const op = String(data?.operator || ">").trim();
  const threshold = Number(data?.value ?? 0);
  let actual = Number(context?.[field]);
  if (!Number.isFinite(actual)) {
    const docAmount = Number(context?.documentAmount);
    if (field === "amount" && Number.isFinite(docAmount)) actual = docAmount;
    else actual = 0;
  }
  switch (op) {
    case ">=":
      return actual >= threshold;
    case "<=":
      return actual <= threshold;
    case "<":
      return actual < threshold;
    case "=":
    case "==":
      return actual === threshold;
    case "!=":
      return actual !== threshold;
    default:
      return actual > threshold;
  }
}

async function assertAssignee(data) {
  const assigneeType = data?.assigneeType || data?.assignee_type;
  const assigneeId = Number(data?.assigneeId ?? data?.assignee_id ?? data?.role_id ?? data?.user_id);
  if (!["role", "user"].includes(assigneeType)) {
    const err = new Error("Invalid assignee type on approval node");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
    const err = new Error("Invalid assignee on approval node");
    err.statusCode = 400;
    throw err;
  }
  const table = assigneeType === "role" ? "roles" : "users";
  const exists = await query(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [assigneeId]);
  if (!exists.rowCount) {
    const err = new Error("Assignee not found");
    err.statusCode = 400;
    throw err;
  }
  return { assigneeType, assigneeId };
}

async function notifyApprovalNode({ node, documentId, workflowName }) {
  const data = node.data || {};
  const { assigneeType, assigneeId } = await assertAssignee(data);
  const link = `/documents/${documentId}?tab=workflow`;
  const title = data.label || "Approbation workflow";
  const message = `Action requise sur « ${workflowName || "document"} ».`;
  if (assigneeType === "user") {
    await createNotification({ userId: assigneeId, type: "workflow", title, message, link });
  } else {
    await notifyRoleUsers({ roleId: assigneeId, type: "workflow", title, message, link });
  }
}

async function runNotificationNode(node, { documentId, ownerId, workflowName }) {
  const data = node.data || {};
  const title = data.title || "Notification workflow";
  const message =
    data.message ||
    `Étape « ${data.label || node.type} » exécutée pour le document #${documentId}.`;
  const link = data.link || `/documents/${documentId}?tab=workflow`;
  if (data.targetType === "owner" && ownerId) {
    await createNotification({ userId: Number(ownerId), type: "workflow", title, message, link });
    return;
  }
  if (data.targetType === "role" && data.roleId) {
    await notifyRoleUsers({
      roleId: Number(data.roleId),
      type: "workflow",
      title,
      message,
      link,
    });
    return;
  }
  if (data.targetType === "user" && data.userId) {
    await createNotification({
      userId: Number(data.userId),
      type: "workflow",
      title,
      message,
      link,
    });
  }
}

/** Ordre BFS des nœuds d'approbation pour synchroniser workflow_steps (compatibilité tâches) */
function collectApprovalNodesInOrder(def) {
  const start = findStartNode(def);
  if (!start) return [];
  const order = [];
  const seen = new Set();
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = getNode(def, id);
    if (!node) continue;
    if (node.type === "approval") order.push(node);
    const outs = def.edges.filter((e) => e.source === id);
    for (const e of outs) {
      if (!seen.has(e.target)) queue.push(e.target);
    }
  }
  return order;
}

async function syncLinearStepsFromVisual(workflowId, def) {
  await query("DELETE FROM workflow_steps WHERE workflow_id = ?", [workflowId]);
  const approvals = collectApprovalNodesInOrder(def);
  const nodeStepMap = {};
  let order = 1;
  for (const node of approvals) {
    const data = node.data || {};
    const { assigneeType, assigneeId } = await assertAssignee(data);
    const dueHours = Number(data.dueHours ?? data.due_hours ?? 0) || 0;
    const reminderHours = Number(data.reminderHours ?? data.reminder_hours ?? 0) || 0;
    const ins = await query(
      `INSERT INTO workflow_steps (workflow_id, step_order, assignee_type, assignee_id, due_hours, reminder_hours)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workflowId, order, assigneeType, assigneeId, dueHours, reminderHours]
    );
    nodeStepMap[node.id] = ins.rows.insertId;
    order += 1;
  }
  return nodeStepMap;
}

async function saveVisualWorkflow({ id, name, description, documentCategory, definition }) {
  const def = normalizeDefinition(definition);
  if (!def.nodes.length) {
    const err = new Error("Visual workflow must contain at least one node");
    err.statusCode = 400;
    throw err;
  }
  const nodeStepMap = await syncLinearStepsFromVisual(id, def);
  def.nodeStepMap = nodeStepMap;
  await query(
    `UPDATE workflows
     SET name = ?, description = ?, document_category = ?, visual_definition = ?, is_visual = 1
     WHERE id = ?`,
    [
      name,
      description || null,
      documentCategory || null,
      JSON.stringify(def),
      id,
    ]
  );
  return { id, nodeStepMap };
}

async function createVisualWorkflow({ name, description, documentCategory, definition }) {
  const created = await query(
    `INSERT INTO workflows (name, description, document_category, is_visual)
     VALUES (?, ?, ?, 1)`,
    [name, description || null, documentCategory || null]
  );
  const workflowId = created.rows.insertId;
  await saveVisualWorkflow({
    id: workflowId,
    name,
    description,
    documentCategory,
    definition,
  });
  return { id: workflowId };
}

async function getVisualWorkflow(workflowId) {
  const res = await query(
    `SELECT id, name, description, document_category, visual_definition, is_visual, created_at
     FROM workflows WHERE id = ? LIMIT 1`,
    [workflowId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    ...row,
    visual_definition: parseDefinition(row.visual_definition),
  };
}

async function processChainFromNode({
  instanceId,
  nodeId,
  def,
  context,
  documentId,
  ownerId,
  workflowName,
}) {
  let currentId = nodeId;
  let guard = 0;
  while (currentId && guard < 50) {
    guard += 1;
    const node = getNode(def, currentId);
    if (!node) break;

    if (node.type === "approval") {
      const stepId = def.nodeStepMap?.[node.id] || null;
      const dueHours = Number(node.data?.dueHours ?? 0) || 0;
      if (dueHours > 0) {
        await query(
          `UPDATE workflow_instances
           SET current_node_id = ?, current_step_id = ?, status = 'pending',
               due_date = DATE_ADD(NOW(), INTERVAL ? HOUR), reminder_sent_at = NULL
           WHERE id = ?`,
          [node.id, stepId, dueHours, instanceId]
        );
      } else {
        await query(
          `UPDATE workflow_instances
           SET current_node_id = ?, current_step_id = ?, status = 'pending', due_date = NULL, reminder_sent_at = NULL
           WHERE id = ?`,
          [node.id, stepId, instanceId]
        );
      }
      await notifyApprovalNode({ node, documentId, workflowName });
      return { status: "waiting", currentNodeId: node.id, currentStepId: stepId };
    }

    if (TERMINAL_REJECT_TYPES.has(node.type)) {
      await query(
        `UPDATE workflow_instances
         SET status = 'rejected', completed_at = NOW(), current_node_id = ?, current_step_id = NULL, due_date = NULL
         WHERE id = ?`,
        [node.id, instanceId]
      );
      await query("UPDATE documents SET status = 'rejected' WHERE id = ?", [documentId]);
      return { status: "rejected", currentNodeId: node.id };
    }

    if (node.type === "notification") {
      await runNotificationNode(node, { documentId, ownerId, workflowName });
      currentId = nextTarget(def, node.id, "default") || nextTarget(def, node.id);
      continue;
    }

    if (node.type === "delay") {
      const days = Math.max(0, Number(node.data?.days ?? node.data?.delayDays ?? 1));
      await query(
        `UPDATE workflow_instances SET due_date = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?`,
        [days, instanceId]
      );
      currentId = nextTarget(def, node.id, "default") || nextTarget(def, node.id);
      continue;
    }

    if (node.type === "condition") {
      const ok = evaluateCondition(node.data || {}, context);
      currentId = nextTarget(def, node.id, ok ? "true" : "false") || nextTarget(def, node.id, ok ? "yes" : "no");
      continue;
    }

    if (node.type === "start" || node.type === "end") {
      if (node.type === "end") {
        await query(
          `UPDATE workflow_instances
           SET status = 'approved', completed_at = NOW(), current_node_id = ?, current_step_id = NULL, due_date = NULL
           WHERE id = ?`,
          [node.id, instanceId]
        );
        await query("UPDATE documents SET status = 'approved' WHERE id = ?", [documentId]);
        return { status: "approved", currentNodeId: node.id };
      }
      currentId = nextTarget(def, node.id, "default") || nextTarget(def, node.id);
      continue;
    }

    currentId = nextTarget(def, node.id, "default") || nextTarget(def, node.id);
  }

  await query(
    `UPDATE workflow_instances
     SET status = 'approved', completed_at = NOW(), current_node_id = NULL, current_step_id = NULL
     WHERE id = ?`,
    [instanceId]
  );
  await query("UPDATE documents SET status = 'approved' WHERE id = ?", [documentId]);
  return { status: "approved" };
}

async function startVisualInstance({ workflowId, documentId, actorId, comment, context = {} }) {
  const wf = await getVisualWorkflow(workflowId);
  if (!wf || !wf.is_visual) {
    const err = new Error("Visual workflow not found");
    err.statusCode = 404;
    throw err;
  }
  const def = wf.visual_definition;
  if (!def?.nodes?.length) {
    const err = new Error("Workflow has no visual definition");
    err.statusCode = 400;
    throw err;
  }

  const doc = await query("SELECT id, owner_id, title, size FROM documents WHERE id = ?", [documentId]);
  if (!doc.rows.length) {
    const err = new Error("Document not found");
    err.statusCode = 404;
    throw err;
  }
  const docRow = doc.rows[0];
  const runtimeContext = {
    ...context,
    documentAmount: context.amount ?? Number(docRow.size) / 100,
  };

  const insert = await query(
    `INSERT INTO workflow_instances
     (document_id, workflow_id, current_step_id, current_node_id, status, started_at, is_visual, visual_state_json)
     VALUES (?, ?, NULL, NULL, 'pending', NOW(), 1, ?)`,
    [documentId, workflowId, JSON.stringify({ context: runtimeContext })]
  );
  const instanceId = insert.rows.insertId;

  await query("UPDATE documents SET status = 'in_review' WHERE id = ?", [documentId]);
  await query(
    `INSERT INTO workflow_actions (instance_id, step_id, actor_id, action, comment)
     VALUES (?, NULL, ?, 'start', ?)`,
    [instanceId, actorId, comment || null]
  );

  const start = findStartNode(def);
  const result = await processChainFromNode({
    instanceId,
    nodeId: start.id,
    def,
    context: runtimeContext,
    documentId,
    ownerId: docRow.owner_id,
    workflowName: wf.name,
  });

  return { instanceId, ...result };
}

function isUserAssignedToApprovalNode(node, user) {
  const data = node?.data || {};
  const assigneeType = data.assigneeType || data.assignee_type;
  const assigneeId = Number(data.assigneeId ?? data.assignee_id ?? data.role_id ?? data.user_id);
  if (assigneeType === "user") return String(assigneeId) === String(user.id);
  if (assigneeType === "role") {
    return (user.roleIds || []).some((rid) => String(rid) === String(assigneeId));
  }
  return false;
}

async function applyVisualAction({ instanceId, action, user, comment, isAdmin }) {
  const inst = await query(
    `SELECT wi.*, w.name AS workflow_name, w.visual_definition, d.owner_id, d.title AS document_title
     FROM workflow_instances wi
     JOIN workflows w ON w.id = wi.workflow_id
     JOIN documents d ON d.id = wi.document_id
     WHERE wi.id = ? AND wi.is_visual = 1`,
    [instanceId]
  );
  if (!inst.rows.length) {
    const err = new Error("Visual workflow instance not found");
    err.statusCode = 404;
    throw err;
  }
  const row = inst.rows[0];
  if (row.status !== "pending") {
    const err = new Error("Workflow instance is not pending");
    err.statusCode = 409;
    throw err;
  }

  const def = parseDefinition(row.visual_definition);
  const currentNode = getNode(def, row.current_node_id);
  if (!currentNode || currentNode.type !== "approval") {
    const err = new Error("No approval step active");
    err.statusCode = 409;
    throw err;
  }
  if (!isAdmin && !isUserAssignedToApprovalNode(currentNode, user)) {
    const err = new Error("Not authorized for this workflow step");
    err.statusCode = 403;
    throw err;
  }

  let state = {};
  try {
    state = typeof row.visual_state_json === "string" ? JSON.parse(row.visual_state_json) : row.visual_state_json || {};
  } catch {
    state = {};
  }
  const context = state.context || {};

  await query(
    `INSERT INTO workflow_actions (instance_id, step_id, actor_id, action, comment)
     VALUES (?, ?, ?, ?, ?)`,
    [instanceId, row.current_step_id, user.id, action, comment || null]
  );

  if (action === "reject" || action === "request_changes") {
    const handle = action === "reject" ? "reject" : "changes";
    let target =
      nextTarget(def, currentNode.id, handle) ||
      nextTarget(def, currentNode.id, "reject") ||
      def.nodes.find((n) => n.type === "reject")?.id;
    if (!target) {
      await query(
        `UPDATE workflow_instances SET status = 'changes_requested', completed_at = NOW() WHERE id = ?`,
        [instanceId]
      );
      await query("UPDATE documents SET status = 'changes_requested' WHERE id = ?", [row.document_id]);
      return { status: "changes_requested" };
    }
    return processChainFromNode({
      instanceId,
      nodeId: target,
      def,
      context,
      documentId: row.document_id,
      ownerId: row.owner_id,
      workflowName: row.workflow_name,
    });
  }

  const target =
    nextTarget(def, currentNode.id, "approve") ||
    nextTarget(def, currentNode.id, "approved") ||
    nextTarget(def, currentNode.id, "default");
  if (!target) {
    await query(
      `UPDATE workflow_instances SET status = 'approved', completed_at = NOW(), current_node_id = NULL, current_step_id = NULL WHERE id = ?`,
      [instanceId]
    );
    await query("UPDATE documents SET status = 'approved' WHERE id = ?", [row.document_id]);
    return { status: "approved" };
  }

  return processChainFromNode({
    instanceId,
    nodeId: target,
    def,
    context,
    documentId: row.document_id,
    ownerId: row.owner_id,
    workflowName: row.workflow_name,
  });
}

module.exports = {
  parseDefinition,
  normalizeDefinition,
  createVisualWorkflow,
  saveVisualWorkflow,
  getVisualWorkflow,
  startVisualInstance,
  applyVisualAction,
  collectApprovalNodesInOrder,
  isUserAssignedToApprovalNode,
};
