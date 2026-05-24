const { query } = require("../../config/db");
const { isAdmin, isManager } = require("../../utils/auth-roles");


/** Documents « publics » au sens liste : visibles par tous les rôles authentifiés. */
const PUBLIC_ACTIVE_SQL = `(
  d.visibility = 'public' AND d.status = 'active' AND d.deleted_at IS NULL
)`;

/**
 * Clause SQL : documents visibles selon le rôle.
 * - Admin : tout.
 * - Manager : tout.
 * - Utilisateur standard : ses documents + publics actifs uniquement.
 */
function documentsVisibleSql(user) {
  if (isAdmin(user) || isManager(user)) {
    return { sql: "1 = 1", params: [] };
  }
  const uid = user.id;

  return {
    sql: `(
      d.owner_id = ?
      OR ${PUBLIC_ACTIVE_SQL}
    )`,
    params: [uid],
  };
}

async function getBestActiveShare(documentId, user) {
  const roleIds = user.roleIds || [];
  if (roleIds.length === 0) {
    const r = await query(
      `SELECT * FROM document_shares
       WHERE document_id = ?
         AND revoked = 0
         AND NOW() >= start_date
         AND (end_date IS NULL OR NOW() <= end_date)
         AND shared_with_user_id = ?
       ORDER BY FIELD(permission, 'manage', 'download', 'view')
       LIMIT 1`,
      [documentId, user.id]
    );
    return r.rows[0] || null;
  }
  const ph = roleIds.map(() => "?").join(",");
  const r = await query(
    `SELECT * FROM document_shares
     WHERE document_id = ?
       AND revoked = 0
       AND NOW() >= start_date
       AND (end_date IS NULL OR NOW() <= end_date)
       AND (
         shared_with_user_id = ?
         OR (
           shared_with_role_id IS NOT NULL
           AND shared_with_role_id IN (${ph})
         )
       )
     ORDER BY FIELD(permission, 'manage', 'download', 'view')
     LIMIT 1`,
    [documentId, user.id, ...roleIds]
  );
  return r.rows[0] || null;
}

/**
 * @param {object} user req.user
 * @param {object} docRow ligne documents.*
 */
async function resolveDocumentAccess(user, docRow) {
  if (isAdmin(user)) {
    return {
      kind: "admin",
      permission: null,
      canView: true,
      canDownload: true,
      canManageVersion: true,
      share: null,
    };
  }
  if (isManager(user)) {
    return {
      kind: "manager",
      permission: null,
      canView: true,
      canDownload: true,
      canManageVersion: false,
      share: null,
    };
  }
  const isPublicActive =
    String(docRow.visibility || "").toLowerCase() === "public" &&
    docRow.status === "active" &&
    docRow.deleted_at == null;
  if (isPublicActive) {
    return {
      kind: "public",
      permission: "view",
      canView: true,
      canDownload: true,
      canManageVersion: false,
      share: null,
    };
  }
  if (String(docRow.owner_id) === String(user.id)) {
    return {
      kind: "owner",
      permission: null,
      canView: true,
      canDownload: true,
      canManageVersion: true,
      share: null,
    };
  }
  return {
    kind: "none",
    permission: null,
    canView: false,
    canDownload: false,
    canManageVersion: false,
    share: null,
  };
}

function assertMinAccess(access, need) {
  if (need === "view") return access.canView;
  if (need === "download") return access.canDownload;
  if (need === "manage") return access.canManageVersion;
  return false;
}

async function getDocumentWithAccess(user, documentId) {
  const doc = await query(
    `SELECT d.*, u.full_name AS owner_name
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     WHERE d.id = ?`,
    [documentId]
  );
  if (!doc.rows.length) {
    return { error: { status: 404, body: { success: false, message: "Document not found" } } };
  }
  const access = await resolveDocumentAccess(user, doc.rows[0]);
  if (access.kind === "none") {
    return { error: { status: 403, body: { success: false, message: "Access denied" } } };
  }
  return { docRow: doc.rows[0], access };
}

module.exports = {
  documentsVisibleSql,
  getBestActiveShare,
  resolveDocumentAccess,
  assertMinAccess,
  getDocumentWithAccess,
};
