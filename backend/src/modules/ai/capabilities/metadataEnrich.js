const { query } = require("../../../config/db");
const { documentsVisibleSql } = require("../../documents/document-access.service");
const { isAdmin } = require("../../../middlewares/auth");
const { detectDocType } = require("../shared/documentNlp");

function extractMetadataFields(rawText) {
  const text = String(rawText || "");
  const joined = text.replace(/\s+/g, " ").trim();
  const dateMatch =
    joined.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    joined.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
    joined.match(/\b(\d{2}-\d{2}-\d{4})\b/);
  const amountMatch =
    joined.match(/\b(?:montant|total|amount|ttc|ht)\s*[:=]?\s*([0-9]+(?:[.,][0-9]{2})?)\s*(?:dt|tnd|eur|usd|€|\$)?/i) ||
    joined.match(/\b([0-9]+(?:[.,][0-9]{2})?)\s*(?:dt|tnd|eur|usd|€|\$)\b/i);
  const clientMatch = joined.match(/\b(?:client|customer)\s*[:=]?\s*([A-Za-z0-9 ._\-]+)/i);
  const supplierMatch = joined.match(/\b(?:fournisseur|supplier|vendor)\s*[:=]?\s*([A-Za-z0-9 ._\-]+)/i);
  const docNoMatch = joined.match(/\b(?:n[°o]|num[eé]ro|number|ref|reference|invoice)\s*[:#=]?\s*([A-Za-z0-9\-_/]+)/i);
  const dueDateMatch =
    joined.match(/\b(?:echeance|échéance|due date|expire|expiration)\s*[:=]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[\/-]\d{2}[\/-]\d{4})/i) ||
    null;

  const candidateMatch = joined.match(/\b(?:candidat|candidat\s*:|nom)\s*[:=]?\s*([A-Za-zÀ-ÿ\s\-']{3,60})/i);
  const posteMatch = joined.match(/\b(?:poste|position|role)\s*[:=]?\s*([A-Za-z0-9 À-ÿ\-/]{3,80})/i);

  return {
    date: dateMatch ? dateMatch[1] : "",
    montant: amountMatch ? amountMatch[1].replace(",", ".") : "",
    client: clientMatch ? clientMatch[1].trim().slice(0, 120) : "",
    fournisseur: supplierMatch ? supplierMatch[1].trim().slice(0, 120) : "",
    numero_document: docNoMatch ? docNoMatch[1].trim().slice(0, 120) : "",
    echeance: dueDateMatch ? dueDateMatch[1] : "",
    candidat: candidateMatch ? candidateMatch[1].trim().slice(0, 120) : "",
    poste: posteMatch ? posteMatch[1].trim().slice(0, 120) : "",
  };
}

async function mapMetadataToCustomFields(documentId, category, metadata, { canManage }) {
  const mapped = [];
  if (!canManage) return mapped;

  const fields = await query(
    `SELECT id, name, type
     FROM custom_fields
     WHERE is_active = 1
       AND (document_type IS NULL OR document_type = '' OR document_type = ?)`,
    [category || ""]
  );

  for (const f of fields.rows) {
    const n = String(f.name || "").toLowerCase();
    let val = null;
    if (n.includes("date") && metadata.date) val = metadata.date;
    else if ((n.includes("montant") || n.includes("amount") || n.includes("total")) && metadata.montant)
      val = metadata.montant;
    else if (n.includes("client") && metadata.client) val = metadata.client;
    else if ((n.includes("fournisseur") || n.includes("supplier") || n.includes("vendor")) && metadata.fournisseur)
      val = metadata.fournisseur;
    else if ((n.includes("num") || n.includes("référence") || n.includes("reference")) && metadata.numero_document)
      val = metadata.numero_document;
    else if ((n.includes("échéance") || n.includes("echeance") || n.includes("expiry")) && metadata.echeance)
      val = metadata.echeance;
    else if ((n.includes("candidat") || n.includes("nom")) && metadata.candidat) val = metadata.candidat;
    else if (n.includes("poste") && metadata.poste) val = metadata.poste;

    if (val != null && String(val).trim() !== "") {
      await query(
        `INSERT INTO document_custom_values (document_id, field_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [documentId, Number(f.id), String(val)]
      );
      mapped.push({ fieldId: Number(f.id), fieldName: f.name, value: String(val) });
    }
  }
  return mapped;
}

async function enrichDocumentRecord(doc, { applyToCustomFields, canManage, extractTextFn }) {
  let content = String(doc.extracted_text || "").slice(0, 20000);
  if (!content.trim() && extractTextFn) {
    content = String(
      (await extractTextFn(doc.file_path, doc.mime_type, doc.original_name)) || ""
    ).slice(0, 20000);
  }
  if (!content.trim()) content = String(doc.description || "");

  const metadata = extractMetadataFields(`${doc.title}\n${content}`);
  const det = detectDocType(content);
  const suggestedTags = det.tags.filter(Boolean);

  let mapped = [];
  if (applyToCustomFields) {
    mapped = await mapMetadataToCustomFields(doc.id, doc.category, metadata, { canManage });
  }

  return {
    documentId: doc.id,
    title: doc.title,
    metadata,
    suggestedCategory: det.category,
    suggestedTags,
    mapped,
  };
}

async function batchEnrichDocuments(user, { documentIds, applyToCustomFields, extractTextFn, limit = 25 }) {
  const ids = Array.isArray(documentIds)
    ? [...new Set(documentIds.map(Number).filter((n) => n > 0))].slice(0, limit)
    : [];

  let docs = [];
  if (ids.length > 0) {
    for (const id of ids) {
      const row = await query(`SELECT * FROM documents WHERE id = ? LIMIT 1`, [id]);
      if (row.rows[0]) docs.push(row.rows[0]);
    }
  } else {
    const vis = documentsVisibleSql(user, "d");
    const rows = await query(
      `SELECT d.*
       FROM documents d
       WHERE ${vis.sql}
         AND d.status NOT IN ('deleted', 'archived')
       ORDER BY d.updated_at DESC
       LIMIT ?`,
      [...vis.params, limit]
    );
    docs = rows.rows;
  }

  const results = [];
  for (const doc of docs) {
    const canManage = Number(doc.owner_id) === Number(user.id) || isAdmin(user);
    results.push(
      await enrichDocumentRecord(doc, {
        applyToCustomFields: Boolean(applyToCustomFields) && canManage,
        canManage,
        extractTextFn,
      })
    );
  }

  return {
    processed: results.length,
    applied: results.filter((r) => r.mapped.length > 0).length,
    results,
  };
}

module.exports = {
  extractMetadataFields,
  enrichDocumentRecord,
  batchEnrichDocuments,
  mapMetadataToCustomFields,
};
