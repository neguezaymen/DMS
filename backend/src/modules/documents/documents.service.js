const fs = require("fs/promises");
const path = require("path");
const { query } = require("../../config/db");
const { isAdmin } = require("../../middlewares/auth");
const { documentsVisibleSql } = require("./document-access.service");

const toDocumentDto = (doc) => ({
  ...doc,
  visibility: doc.visibility || "private",
  tags: doc.tags ? doc.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
  previewUrl: `/api/v1/documents/${doc.id}/preview`,
  downloadUrl: `/api/v1/documents/${doc.id}/download`,
});

async function insertUploadedDocuments({
  files,
  ownerId,
  title,
  category = "General",
  tags = null,
  description = null,
  visibility = "private",
  isUploaderAdmin = false,
}) {
  const vis = String(visibility || "private").toLowerCase() === "public" ? "public" : "private";
  let docStatus = "active";
  if (vis === "public") {
    docStatus = "active";
  } else if (!isUploaderAdmin) {
    docStatus = "pending_approval";
  } else {
    docStatus = "active";
  }

  const insertedIds = [];
  for (const file of files) {
    const insert = await query(
      `INSERT INTO documents
       (title, original_name, file_path, mime_type, size, owner_id, category, status, tags, description, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || file.originalname,
        file.originalname,
        file.path,
        file.mimetype || "application/octet-stream",
        file.size,
        ownerId,
        category,
        docStatus,
        tags,
        description,
        vis,
      ]
    );
    insertedIds.push(insert.rows.insertId);
  }

  const created = await query(
    `SELECT d.*, u.full_name AS owner_name
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     WHERE d.id IN (${insertedIds.map(() => "?").join(",")})
     ORDER BY d.created_at DESC`,
    insertedIds
  );
  return created.rows.map(toDocumentDto);
}

async function updateExtractedText(documentId, extractedText) {
  await query("UPDATE documents SET extracted_text = ?, updated_at = NOW() WHERE id = ?", [
    extractedText || null,
    documentId,
  ]);
}

/**
 * Statistiques tableau de bord : agrégations SQL sur documents (mime_type, status, created_at).
 * @param {{ user: object }} opts
 */
async function getDashboardStats({ user }) {
  let baseWhere = "WHERE d.status <> 'deleted'";
  let baseParams = [];
  if (!isAdmin(user)) {
    const vis = documentsVisibleSql(user);
    baseWhere = `WHERE (${vis.sql}) AND d.status <> 'deleted'`;
    baseParams = vis.params;
  }

  const totalRes = await query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(d.size), 0) AS total_bytes
     FROM documents d ${baseWhere}`,
    baseParams
  );
  const tr = totalRes.rows[0] || {};
  const total = Number(tr.total) || 0;
  const totalBytes = Number(tr.total_bytes) || 0;

  const statusRes = await query(
    `SELECT d.status AS status, COUNT(*) AS cnt
     FROM documents d ${baseWhere}
     GROUP BY d.status`,
    baseParams
  );
  const byStatus = {};
  for (const r of statusRes.rows) {
    let key = r.status != null ? String(r.status).trim() : "";
    if (key === "") key = "(vide)";
    byStatus[key] = Number(r.cnt) || 0;
  }

  const mimeRes = await query(
    `SELECT mime_category, COUNT(*) AS cnt
     FROM (
       SELECT
         CASE
           WHEN LOWER(COALESCE(d.mime_type, '')) LIKE 'image/%' THEN 'Images'
           WHEN LOWER(COALESCE(d.mime_type, '')) LIKE '%pdf%' THEN 'PDF'
           WHEN LOWER(COALESCE(d.mime_type, '')) LIKE '%word%'
             OR LOWER(COALESCE(d.mime_type, '')) LIKE '%spreadsheet%'
             OR LOWER(COALESCE(d.mime_type, '')) LIKE '%presentation%'
             OR LOWER(COALESCE(d.mime_type, '')) LIKE '%officedocument%' THEN 'Office'
           ELSE 'Autres'
         END AS mime_category
       FROM documents d ${baseWhere}
     ) AS categorized
     GROUP BY mime_category`,
    baseParams
  );

  const byMimeCategory = { Images: 0, PDF: 0, Office: 0, Autres: 0 };
  for (const r of mimeRes.rows) {
    const k = r.mime_category;
    if (Object.prototype.hasOwnProperty.call(byMimeCategory, k)) {
      byMimeCategory[k] = Number(r.cnt) || 0;
    } else {
      byMimeCategory.Autres += Number(r.cnt) || 0;
    }
  }

  const monthDateClause =
    "d.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)";
  const visMonth = !isAdmin(user) ? documentsVisibleSql(user) : null;
  const monthWhere = visMonth
    ? `WHERE (${visMonth.sql}) AND ${monthDateClause} AND d.status <> 'deleted'`
    : `WHERE ${monthDateClause} AND d.status <> 'deleted'`;
  const monthParams = visMonth ? visMonth.params : [];

  const monthRes = await query(
    `SELECT DATE_FORMAT(d.created_at, '%Y-%m') AS yyyymm, COUNT(*) AS cnt
     FROM documents d
     ${monthWhere}
     GROUP BY DATE_FORMAT(d.created_at, '%Y-%m')`,
    monthParams
  );

  const byMonth = {};
  for (const r of monthRes.rows) {
    if (r.yyyymm) {
      byMonth[r.yyyymm] = Number(r.cnt) || 0;
    }
  }

  const timelineDateClause =
    "d.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)";
  const timelineWhere = visMonth
    ? `WHERE (${visMonth.sql}) AND ${timelineDateClause} AND d.status <> 'deleted'`
    : `WHERE ${timelineDateClause} AND d.status <> 'deleted'`;
  const timelineParams = visMonth ? visMonth.params : [];

  const timelineRes = await query(
    `SELECT
       d.id,
       d.created_at,
       d.size,
       d.status,
       DATE_FORMAT(d.created_at, '%Y-%m') AS yyyymm,
       CASE
         WHEN LOWER(COALESCE(d.mime_type, '')) LIKE 'image/%' THEN 'Images'
         WHEN LOWER(COALESCE(d.mime_type, '')) LIKE '%pdf%' THEN 'PDF'
         WHEN LOWER(COALESCE(d.mime_type, '')) LIKE '%word%'
           OR LOWER(COALESCE(d.mime_type, '')) LIKE '%spreadsheet%'
           OR LOWER(COALESCE(d.mime_type, '')) LIKE '%presentation%'
           OR LOWER(COALESCE(d.mime_type, '')) LIKE '%officedocument%' THEN 'Office'
         ELSE 'Autres'
       END AS mime_category
     FROM documents d
     ${timelineWhere}
     ORDER BY d.created_at DESC
     LIMIT 5000`,
    timelineParams
  );

  const documentPoints = timelineRes.rows.map((r) => ({
    id: Number(r.id),
    createdAt: r.created_at,
    size: Number(r.size) || 0,
    status: r.status,
    month: r.yyyymm,
    mimeCategory: r.mime_category || "Autres",
  }));

  return {
    total,
    totalBytes,
    byMonth,
    byMimeCategory,
    byStatus,
    documentPoints,
  };
}

async function duplicateDocument({ documentId, newOwnerId }) {
  const doc = await query("SELECT * FROM documents WHERE id = ?", [documentId]);
  if (doc.rows.length === 0) return null;
  const row = doc.rows[0];
  const uploadDir = path.dirname(row.file_path);
  const base = path.basename(row.file_path);
  const newPath = path.join(uploadDir, `${Date.now()}-${Math.round(Math.random() * 1e9)}-dup-${base}`);
  await fs.copyFile(row.file_path, newPath);
  const newTitle = `Copie de ${row.title}`;
  const vis = row.visibility ? String(row.visibility) : "private";
  const insert = await query(
    `INSERT INTO documents
     (title, original_name, file_path, mime_type, size, owner_id, category, status, tags, description, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newTitle,
      row.original_name,
      newPath,
      row.mime_type,
      row.size,
      newOwnerId,
      row.category,
      row.status,
      row.tags,
      row.description,
      vis,
    ]
  );
  const created = await query(
    `SELECT d.*, u.full_name AS owner_name
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     WHERE d.id = ?`,
    [insert.rows.insertId]
  );
  return toDocumentDto(created.rows[0]);
}

async function deleteDocumentPermanent(documentId) {
  const doc = await query("SELECT id, file_path FROM documents WHERE id = ?", [documentId]);
  if (doc.rows.length === 0) return { deleted: false };

  const versions = await query("SELECT file_path FROM document_versions WHERE document_id = ?", [documentId]);
  const paths = new Set([doc.rows[0].file_path, ...versions.rows.map((v) => v.file_path)]);

  await query("DELETE FROM documents WHERE id = ?", [documentId]);

  for (const p of paths) {
    try {
      await fs.unlink(p);
    } catch {
      // fichier déjà absent
    }
  }
  return { deleted: true };
}

async function purgeDeletedDocuments({ olderThanDays = 30 } = {}) {
  const days = Math.max(1, Number(olderThanDays) || 30);
  const oldDeleted = await query(
    `SELECT id
     FROM documents
     WHERE status = 'deleted'
       AND deleted_at IS NOT NULL
       AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [days]
  );

  let purged = 0;
  for (const row of oldDeleted.rows) {
    const result = await deleteDocumentPermanent(Number(row.id));
    if (result.deleted) purged += 1;
  }
  return purged;
}

module.exports = {
  toDocumentDto,
  insertUploadedDocuments,
  updateExtractedText,
  getDashboardStats,
  duplicateDocument,
  deleteDocumentPermanent,
  purgeDeletedDocuments,
};
