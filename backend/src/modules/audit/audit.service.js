const { query } = require("../../config/db");

async function logAudit({
  actorId = null,
  action,
  entityType,
  entityId = null,
  metadata = {},
  ipAddress = null,
  userAgent = null,
}) {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [actorId, action, entityType, entityId, null, JSON.stringify(metadata || {}), ipAddress, userAgent]
  );
}

module.exports = { logAudit };
