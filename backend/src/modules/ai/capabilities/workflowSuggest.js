const { query } = require("../../../config/db");
const { detectDocType, mapToDocumentCategory } = require("../shared/documentNlp");

function categoryMatchesWorkflow(docCategory, workflowCategory) {
  const d = String(docCategory || "").trim().toLowerCase();
  const w = String(workflowCategory || "").trim().toLowerCase();
  if (!d || !w) return false;
  return d.includes(w) || w.includes(d);
}

function buildRationale(category) {
  if (category === "Contrat") {
    return "Contenu contractuel détecté (clause, signature, obligation).";
  }
  if (category === "Facture") {
    return "Contenu financier détecté (facture, montant, paiement).";
  }
  if (category === "Candidature" || category === "Lettre") {
    return "Document RH / candidature — validation recommandée.";
  }
  if (category === "Rapport") {
    return "Rapport ou synthèse — relecture qualité adaptée.";
  }
  return "Workflow de validation suggéré selon la catégorie détectée.";
}

async function findWorkflowForCategory(documentCategory) {
  const tpl = await query(
    `SELECT id, name, document_category
     FROM workflows
     WHERE COALESCE(is_visual, 0) = 0
       AND document_category IS NOT NULL
       AND TRIM(document_category) <> ''
     ORDER BY created_at DESC`
  );

  const normalized = mapToDocumentCategory(documentCategory);
  let best = null;
  for (const row of tpl.rows) {
    if (categoryMatchesWorkflow(normalized, row.document_category)) {
      best = row;
      break;
    }
  }
  if (!best && tpl.rows.length > 0) {
    best = tpl.rows.find((row) =>
      categoryMatchesWorkflow(normalized, mapToDocumentCategory(row.document_category))
    );
  }
  if (!best && tpl.rows.length > 0) best = tpl.rows[0];

  return best
    ? {
        id: best.id,
        name: best.name,
        documentCategory: best.document_category,
      }
    : null;
}

async function suggestWorkflowFromText(text) {
  const det = detectDocType(text);
  const documentCategory = mapToDocumentCategory(det.category);
  const suggestedWorkflow = await findWorkflowForCategory(documentCategory);

  return {
    detectedCategory: documentCategory,
    suggestedTags: det.tags,
    suggestedWorkflow,
    rationale: buildRationale(documentCategory),
  };
}

module.exports = {
  suggestWorkflowFromText,
  findWorkflowForCategory,
  mapToDocumentCategory,
};
