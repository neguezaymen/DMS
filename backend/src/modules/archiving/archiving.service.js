const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");

const ALLOWED_FIELDS = new Set(["status", "category"]);

/**
 * @returns {{ sql: string, params: any[] } | null}
 */
function buildConditionFragment(rule) {
  const field = String(rule.condition_field || "").trim();
  const op = String(rule.condition_operator || "").trim();
  const value = rule.condition_value;

  if (!field || !ALLOWED_FIELDS.has(field)) {
    return null;
  }
  if (op === "=") {
    return { sql: `d.${field} = ?`, params: [value] };
  }
  if (op === "!=" || op === "<>") {
    return { sql: `d.${field} <> ?`, params: [value] };
  }
  return null;
}

async function runArchivingJob({ actorId = null } = {}) {
  const rules = await query("SELECT * FROM archiving_rules WHERE is_active = 1");
  let archivedTotal = 0;

  for (const rule of rules.rows) {
    const days = Math.max(1, Math.min(3650, parseInt(rule.days_inactive, 10) || 30));
    const frag = buildConditionFragment(rule);
    const whereParts = [
      "d.status <> 'archived'",
      `d.updated_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
    ];
    const params = [];
    if (frag) {
      whereParts.push(frag.sql);
      params.push(...frag.params);
    }

    const res = await query(
      `UPDATE documents d
       SET d.status = 'archived', d.updated_at = NOW()
       WHERE ${whereParts.join(" AND ")}`,
      params
    );
    const n = res.rows && res.rows.affectedRows != null ? res.rows.affectedRows : res.rowCount || 0;
    archivedTotal += n;
  }

  if (archivedTotal > 0 && actorId) {
    await logAudit({
      actorId,
      action: "archiving.job",
      entityType: "system",
      metadata: { archivedCount: archivedTotal },
      ipAddress: null,
    });
  }

  return { archivedTotal };
}

module.exports = { runArchivingJob, buildConditionFragment };
