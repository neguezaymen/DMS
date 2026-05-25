const express = require("express");
const { authenticate, authorize } = require("../../middlewares/auth");
/** `query` encapsule `pool.query` (pas `execute`) — LIMIT/OFFSET en littéraux sûrs. Voir `src/config/db.js`. */
const { query } = require("../../config/db");
const { toJsonSafeDeep } = require("../../utils/jsonSafe");

const router = express.Router();

const MAX_CSV_EXPORT_ROWS = 10000;

/** Entiers bornés pour interpolation SQL (LIMIT offset, limit). */
function pagingInts(page, limit) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
  const offset = (p - 1) * lim;
  return { page: p, limit: lim, offset: Math.max(0, offset) };
}

/** Construit la clause WHERE et les paramètres (identique liste + export + COUNT). */
function buildAuditFilters(req) {
  const filters = [];
  const params = [];

  const action = String(req.query.action || "").trim();
  if (action) {
    filters.push("al.action LIKE ?");
    params.push(`%${action}%`);
  }

  const userId = Number(req.query.userId || 0);
  if (Number.isFinite(userId) && userId > 0) {
    filters.push("al.user_id = ?");
    params.push(userId);
  }

  const dateFrom = String(req.query.dateFrom || "").trim();
  if (dateFrom) {
    filters.push("DATE(al.created_at) >= DATE(?)");
    params.push(dateFrom);
  }

  const dateTo = String(req.query.dateTo || "").trim();
  if (dateTo) {
    filters.push("DATE(al.created_at) <= DATE(?)");
    params.push(dateTo);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  return { whereClause, params };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function safeJsonForCsv(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Liste / export : audit_logs + utilisateur + titre document si entity document.
 * Jointure documents en **numérique uniquement** (évite conflit de collations CHAR).
 */
function auditLogsSelectSql(whereClause) {
  return `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id, al.old_values, al.new_values,
              al.ip_address, al.user_agent, al.created_at,
              u.full_name AS user_name,
              CASE WHEN al.entity_type = 'document' THEN d.title ELSE NULL END AS document_title
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN documents d
         ON al.entity_type = 'document'
        AND al.entity_id IS NOT NULL
        AND TRIM(COALESCE(al.entity_id, '')) <> ''
        AND d.id::text = TRIM(al.entity_id)
       ${whereClause}`;
}

router.get("/export", authenticate, authorize("audit:read"), async (req, res, next) => {
  try {
    const { whereClause, params } = buildAuditFilters(req);
    const logs = await query(
      `${auditLogsSelectSql(whereClause)}
       ORDER BY al.created_at DESC
       LIMIT ${MAX_CSV_EXPORT_ROWS}`,
      params
    );

    const headerRow = ["date", "utilisateur", "action", "document", "IP", "details"];
    const lines = [headerRow.map(csvEscape).join(",")];

    for (const row of logs.rows || []) {
      let details = "";
      if (row.new_values != null) {
        details = safeJsonForCsv(row.new_values);
      } else if (row.old_values != null) {
        details = safeJsonForCsv(row.old_values);
      }

      const documentCol =
        row.document_title ||
        (row.entity_type === "document" && row.entity_id ? `#${row.entity_id}` : "") ||
        "";

      const dateStr = row.created_at
        ? new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19)
        : "";

      lines.push(
        [
          csvEscape(dateStr),
          csvEscape(row.user_name || (row.user_id ? `Utilisateur #${row.user_id}` : "")),
          csvEscape(row.action || ""),
          csvEscape(documentCol),
          csvEscape(row.ip_address || ""),
          csvEscape(details),
        ].join(",")
      );
    }

    const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
    const body = `\uFEFF${lines.join("\r\n")}`;

    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(body);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [GET /api/v1/audit-logs/export]", error?.message || error);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", error?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", error?.sqlState, error?.code);
    return next(error);
  }
});

router.get("/", authenticate, authorize("audit:read"), async (req, res, next) => {
  const { page, limit, offset } = pagingInts(req.query.page, req.query.limit);
  try {
    const { whereClause, params } = buildAuditFilters(req);

    const listSql = `${auditLogsSelectSql(whereClause)}
       ORDER BY al.created_at DESC
       LIMIT ${offset}, ${limit}`;

    const logs = await query(listSql, params);

    const countRow = await query(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       ${whereClause}`,
      params
    );

    const users = await query(
      `SELECT DISTINCT u.id, u.full_name
       FROM audit_logs al
       INNER JOIN users u ON u.id = al.user_id
       ORDER BY u.full_name ASC`
    );
    const actions = await query(
      `SELECT DISTINCT al.action AS action
       FROM audit_logs al
       ORDER BY al.action ASC`
    );

    const dataRows = Array.isArray(logs.rows) ? logs.rows : [];

    return res.json(
      toJsonSafeDeep({
        success: true,
        data: dataRows,
        filters: {
          users: Array.isArray(users.rows) ? users.rows : [],
          actions: (Array.isArray(actions.rows) ? actions.rows : [])
            .map((row) => row.action)
            .filter(Boolean),
        },
        pagination: {
          page,
          limit,
          total: Number(countRow.rows?.[0]?.total || 0),
        },
      })
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [GET /api/v1/audit-logs]", error?.message || error);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", error?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", error?.sqlState, error?.code);
    // eslint-disable-next-line no-console
    console.error("[ERROR] context:", { page, limit, offset });
    return next(error);
  }
});

module.exports = router;
