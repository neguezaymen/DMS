const express = require("express");
const { query } = require("../../config/db");
const { isAdmin } = require("../../middlewares/auth");
const { logAudit } = require("../audit/audit.service");
const { createNotification, notifyRoleUsers } = require("../notifications/notifications.service");
const sharesRouter = express.Router({ mergeParams: true });

async function assertCanManageShares(req, res) {
  const documentId = Number(req.params.id);
  const doc = await query("SELECT * FROM documents WHERE id = ?", [documentId]);
  if (doc.rows.length === 0) {
    res.status(404).json({ success: false, message: "Document not found" });
    return null;
  }
  const isOwner = String(doc.rows[0].owner_id) === String(req.user.id);
  if (!isAdmin(req.user) && !isOwner) {
    res.status(403).json({ success: false, message: "Seul le propriétaire ou un admin peut gérer les partages" });
    return null;
  }
  return { documentId, docRow: doc.rows[0] };
}

sharesRouter.get("/", async (req, res, next) => {
  try {
    const ctx = await assertCanManageShares(req, res);
    if (!ctx) return;
    const rows = await query(
      `SELECT ds.id, ds.document_id, ds.shared_with_user_id, ds.shared_with_role_id, ds.permission,
              ds.start_date, ds.end_date, ds.created_by, ds.created_at, ds.revoked,
              u.full_name AS created_by_name,
              su.full_name AS shared_user_name,
              r.name AS shared_role_name
       FROM document_shares ds
       JOIN users u ON u.id = ds.created_by
       LEFT JOIN users su ON su.id = ds.shared_with_user_id
       LEFT JOIN roles r ON r.id = ds.shared_with_role_id
       WHERE ds.document_id = ?
       ORDER BY ds.created_at DESC`,
      [ctx.documentId]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (e) {
    return next(e);
  }
});

sharesRouter.post("/", async (req, res, next) => {
  try {
    const ctx = await assertCanManageShares(req, res);
    if (!ctx) return;

    const {
      sharedWithUserId,
      sharedWithRoleId,
      permission = "view",
      startDate,
      endDate,
    } = req.body;

    const hasUser = sharedWithUserId != null && sharedWithUserId !== "";
    const hasRole = sharedWithRoleId != null && sharedWithRoleId !== "";
    if (hasUser === hasRole) {
      return res.status(400).json({
        success: false,
        message: "Indiquez exactement un destinataire : sharedWithUserId OU sharedWithRoleId",
      });
    }
    if (!["view", "download", "manage"].includes(permission)) {
      return res.status(400).json({ success: false, message: "permission invalide" });
    }

    const ins = await query(
      `INSERT INTO document_shares
       (document_id, shared_with_user_id, shared_with_role_id, permission, start_date, end_date, created_by, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        ctx.documentId,
        hasUser ? Number(sharedWithUserId) : null,
        hasRole ? Number(sharedWithRoleId) : null,
        permission,
        startDate ? new Date(startDate) : new Date(),
        endDate ? new Date(endDate) : null,
        req.user.id,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      action: "documents.share.create",
      entityType: "document",
      entityId: String(ctx.documentId),
      metadata: {
        shareId: ins.rows.insertId,
        sharedWithUserId: hasUser ? Number(sharedWithUserId) : null,
        sharedWithRoleId: hasRole ? Number(sharedWithRoleId) : null,
        permission,
        startDate,
        endDate,
      },
      ipAddress: req.ip,
    });

    const documentLink = `/documents/${ctx.documentId}`;
    if (hasUser) {
      await createNotification({
        userId: Number(sharedWithUserId),
        type: "share",
        title: "Document partagé avec vous",
        message: `Un document vous a été partagé avec la permission « ${permission} ».`,
        link: documentLink,
      });
    } else if (hasRole) {
      await notifyRoleUsers({
        roleId: Number(sharedWithRoleId),
        type: "share",
        title: "Document partagé avec votre rôle",
        message: `Un document a été partagé avec votre rôle avec la permission « ${permission} ».`,
        link: documentLink,
      });
    }

    return res.status(201).json({ success: true, data: { id: ins.rows.insertId } });
  } catch (e) {
    return next(e);
  }
});

sharesRouter.patch("/:shareId/revoke", async (req, res, next) => {
  try {
    const ctx = await assertCanManageShares(req, res);
    if (!ctx) return;
    const shareId = Number(req.params.shareId);

    const existing = await query(
      "SELECT id FROM document_shares WHERE id = ? AND document_id = ?",
      [shareId, ctx.documentId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Partage introuvable" });
    }

    await query("UPDATE document_shares SET revoked = 1 WHERE id = ?", [shareId]);

    await logAudit({
      actorId: req.user.id,
      action: "documents.share.revoke",
      entityType: "document",
      entityId: String(ctx.documentId),
      metadata: { shareId },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: "Partage révoqué" });
  } catch (e) {
    return next(e);
  }
});

module.exports = sharesRouter;
