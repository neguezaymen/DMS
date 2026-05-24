const express = require("express");
const { authenticate, isAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const { getDocumentWithAccess, assertMinAccess } = require("./document-access.service");

const router = express.Router();

/**
 * DELETE /api/v1/comments/:id
 * Suppression : auteur du commentaire ou administrateur.
 */
router.delete("/:id", authenticate, async (req, res, next) => {
  try {
    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return res.status(400).json({ success: false, message: "Identifiant de commentaire invalide" });
    }

    const found = await query(
      `SELECT id, document_id, user_id, LEFT(comment, 200) AS comment_preview
       FROM document_comments WHERE id = ?`,
      [commentId]
    );
    if (!found.rows.length) {
      return res.status(404).json({ success: false, message: "Commentaire introuvable" });
    }
    const c = found.rows[0];
    const documentId = Number(c.document_id);

    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Accès refusé" });
    }

    const isAuthor = Number(c.user_id) === Number(req.user.id);
    if (!isAdmin(req.user) && !isAuthor) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez supprimer que vos propres commentaires",
      });
    }

    await query("DELETE FROM document_comments WHERE id = ?", [commentId]);

    await logAudit({
      actorId: req.user.id,
      action: "documents.comments.delete",
      entityType: "document_comment",
      entityId: String(commentId),
      metadata: {
        documentId,
        deletedAuthorId: c.user_id,
        preview: c.comment_preview,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.json({ success: true, message: "Commentaire supprimé" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
