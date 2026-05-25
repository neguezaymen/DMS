const { query } = require("../../../config/db");
const { documentsVisibleSql } = require("../../documents/document-access.service");
const { suggestWorkflowFromText } = require("./workflowSuggest");
const { detectDocType, mapToDocumentCategory } = require("../shared/documentNlp");

function inferPriority(category, text) {
  const t = String(text || "").toLowerCase();
  if (/(urgent|immédiat|asap|retard|impayé)/i.test(t)) return "high";
  if (/(candidature|contrat|facture)/i.test(`${category} ${t}`)) return "normal";
  return "low";
}

async function suggestRoutingForDocument(doc) {
  const text = `${doc.title}\n${doc.extracted_text || ""}\n${doc.description || ""}`.slice(0, 8000);
  const workflow = await suggestWorkflowFromText(text);
  const det = detectDocType(text);
  const category = doc.category || mapToDocumentCategory(det.category);

  const instances = await query(
    `SELECT wi.id, wi.status, w.name AS workflow_name
     FROM workflow_instances wi
     JOIN workflows w ON w.id = wi.workflow_id
     WHERE wi.document_id = ?
     ORDER BY wi.started_at DESC
     LIMIT 3`,
    [doc.id]
  );

  const activeWorkflow = instances.rows.find((r) =>
    ["pending", "in_progress", "active", "changes_requested"].includes(
      String(r.status || "").toLowerCase()
    )
  );

  return {
    documentId: doc.id,
    title: doc.title,
    currentCategory: category,
    suggestedCategory: workflow.detectedCategory,
    suggestedTags: workflow.suggestedTags,
    suggestedWorkflow: workflow.suggestedWorkflow,
    rationale: workflow.rationale,
    priority: inferPriority(category, text),
    hasActiveWorkflow: Boolean(activeWorkflow),
    activeWorkflowName: activeWorkflow?.workflow_name || null,
    canStartWorkflow: !activeWorkflow && Boolean(workflow.suggestedWorkflow),
  };
}

async function listRoutingRecommendations(user, { limit = 20 } = {}) {
  const vis = documentsVisibleSql(user, "d");
  const rows = await query(
    `SELECT d.id, d.title, d.category, d.description, d.extracted_text, d.status, d.created_at
     FROM documents d
     WHERE ${vis.sql}
       AND d.status IN ('active', 'pending_approval', 'draft', 'in_review')
     ORDER BY d.created_at DESC
     LIMIT ?`,
    [...vis.params, limit]
  );

  const recommendations = [];
  for (const doc of rows.rows) {
    recommendations.push(await suggestRoutingForDocument(doc));
  }

  return {
    total: recommendations.length,
    withoutWorkflow: recommendations.filter((r) => r.canStartWorkflow).length,
    recommendations,
  };
}

module.exports = {
  suggestRoutingForDocument,
  listRoutingRecommendations,
};
