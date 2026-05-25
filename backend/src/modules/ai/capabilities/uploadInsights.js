const { query } = require("../../../config/db");
const { documentsVisibleSql } = require("../../documents/document-access.service");
const { detectDocType, jaccard, mapToDocumentCategory } = require("../shared/documentNlp");
const { suggestWorkflowFromText } = require("./workflowSuggest");

async function findSimilarUploads({ user, text, filename, limit = 5 }) {
  const vis = documentsVisibleSql(user, "d");
  const rows = await query(
    `SELECT d.id, d.title, d.original_name, d.extracted_text
     FROM documents d
     WHERE ${vis.sql}
       AND d.status NOT IN ('deleted', 'archived')
     ORDER BY d.created_at DESC
     LIMIT 120`,
    vis.params
  );

  const probe = `${filename}\n${text}`.slice(0, 4000);
  const scored = rows.rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      originalName: row.original_name,
      similarity: Number((jaccard(probe, String(row.extracted_text || row.title || "")) * 100).toFixed(1)),
    }))
    .filter((row) => row.similarity >= 35)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored;
}

async function analyzeUploadFile({ user, file, extractText }) {
  const text = String((await extractText(file)) || "").slice(0, 8000);
  const combined = `${file.originalname}\n${text}`;
  const det = detectDocType(combined);
  const documentCategory = mapToDocumentCategory(det.category);
  const workflow = await suggestWorkflowFromText(combined);
  const similar = await findSimilarUploads({
    user,
    text,
    filename: file.originalname,
  });

  return {
    filename: file.originalname,
    detectedCategory: documentCategory,
    suggestedTags: det.tags,
    suggestedWorkflow: workflow.suggestedWorkflow,
    rationale: workflow.rationale,
    similar,
    hasDuplicateRisk: similar.some((s) => s.similarity >= 80),
  };
}

module.exports = {
  analyzeUploadFile,
};
