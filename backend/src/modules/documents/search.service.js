const { query } = require("../../config/db");
const { toDocumentDto } = require("./documents.service");
const { documentsVisibleSql } = require("./document-access.service");

async function searchDocuments({
  q = "",
  category,
  status,
  dateFrom,
  dateTo,
  page = 1,
  limit = 10,
  /** Utilisateur courant : documents possédés ou partagés ; absent = vue admin globale. */
  scopeUser = null,
  departmentId = null,
}) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const offset = (normalizedPage - 1) * normalizedLimit;
  const filters = [];
  const params = [];
  let relevanceSelect = "0 AS relevance";
  let orderBy = "d.created_at DESC";

  if (scopeUser) {
    const vis = documentsVisibleSql(scopeUser);
    filters.push(`(${vis.sql})`);
    params.push(...vis.params);
  }

  if (departmentId) {
    filters.push(
      `EXISTS (
         SELECT 1 FROM user_departments ud
         WHERE ud.user_id = d.owner_id AND ud.department_id = ?
       )`
    );
    params.push(Number(departmentId));
  }

  if (q && q.trim()) {
    relevanceSelect = `(
      (CASE WHEN COALESCE(d.title, '')          ILIKE '%' || ? || '%' THEN 4 ELSE 0 END) +
      (CASE WHEN COALESCE(d.description, '')    ILIKE '%' || ? || '%' THEN 2 ELSE 0 END) +
      (CASE WHEN COALESCE(d.tags, '')           ILIKE '%' || ? || '%' THEN 2 ELSE 0 END) +
      (CASE WHEN COALESCE(d.extracted_text, '') ILIKE '%' || ? || '%' THEN 1 ELSE 0 END)
    ) AS relevance`;
    const term = q.trim();
    params.push(term, term, term, term);
    filters.push(
      `(COALESCE(d.title, '') ILIKE '%' || ? || '%'
        OR COALESCE(d.description, '') ILIKE '%' || ? || '%'
        OR COALESCE(d.tags, '') ILIKE '%' || ? || '%'
        OR COALESCE(d.extracted_text, '') ILIKE '%' || ? || '%')`
    );
    params.push(term, term, term, term);
    orderBy = "relevance DESC, d.created_at DESC";
  }
  if (category) {
    filters.push("d.category = ?");
    params.push(category);
  }
  if (status) {
    filters.push("d.status = ?");
    params.push(status);
  } else {
    filters.push("d.status <> 'deleted'");
  }
  if (dateFrom) {
    filters.push("d.created_at >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push("d.created_at <= ?");
    params.push(dateTo);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const safeLimit = Number.isFinite(normalizedLimit) ? normalizedLimit : 10;

  const listSql = `SELECT d.*, u.full_name AS owner_name, ${relevanceSelect}
                   FROM documents d
                   JOIN users u ON u.id = d.owner_id
                   ${whereClause}
                   ORDER BY ${orderBy}
                   LIMIT ${safeLimit} OFFSET ${safeOffset}`;
  const listParams = [...params];
  console.log("[documents.search.list] SQL:", listSql);
  console.log("[documents.search.list] Params:", listParams);
  const listResult = await query(listSql, listParams);

  const countSql = `SELECT COUNT(*) AS total
                    FROM documents d
                    ${whereClause}`;
  console.log("[documents.search.count] SQL:", countSql);
  console.log("[documents.search.count] Params:", params);
  const countResult = await query(countSql, params);

  return {
    data: listResult.rows.map(toDocumentDto),
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: Number(countResult.rows[0]?.total || 0),
    },
  };
}

module.exports = { searchDocuments };
