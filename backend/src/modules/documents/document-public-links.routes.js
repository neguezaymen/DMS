const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../../config/db");
const { isAdmin } = require("../../middlewares/auth");
const { logAudit } = require("../audit/audit.service");
const { generateOpaqueToken, linkPublicPaths } = require("./public-links.service");

const router = express.Router({ mergeParams: true });

async function assertCanManage(req, res) {
  const documentId = Number(req.params.id);
  const doc = await query("SELECT * FROM documents WHERE id = ?", [documentId]);
  if (doc.rows.length === 0) {
    res.status(404).json({ success: false, message: "Document not found" });
    return null;
  }
  const isOwner = String(doc.rows[0].owner_id) === String(req.user.id);
  if (!isAdmin(req.user) && !isOwner) {
    res.status(403).json({
      success: false,
      message: "Seul le propriétaire ou un administrateur peut gérer les liens publics",
    });
    return null;
  }
  return { documentId, docRow: doc.rows[0] };
}

function rowToListItem(row) {
  return {
    id: row.id,
    document_id: row.document_id,
    tokenSuffix: row.token ? String(row.token).slice(-6) : "",
    hasPassword: Boolean(row.password_hash),
    allow_download: Boolean(row.allow_download),
    expires_at: row.expires_at,
    revoked: Boolean(row.revoked),
    created_at: row.created_at,
    created_by_name: row.created_by_name,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const ctx = await assertCanManage(req, res);
    if (!ctx) return;
    const rows = await query(
      `SELECT pl.*, u.full_name AS created_by_name
       FROM public_links pl
       JOIN users u ON u.id = pl.created_by
       WHERE pl.document_id = ?
       ORDER BY pl.created_at DESC`,
      [ctx.documentId]
    );
    return res.json({
      success: true,
      data: rows.rows.map(rowToListItem),
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const ctx = await assertCanManage(req, res);
    if (!ctx) return;

    const password = req.body.password != null ? String(req.body.password) : "";
    const expiresAt = req.body.expiresAt || req.body.expires_at || null;
    const allowDownload =
      req.body.allowDownload !== false && req.body.allow_download !== false;

    let passwordHash = null;
    if (password.length > 0) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    const token = generateOpaqueToken();

    const ins = await query(
      `INSERT INTO public_links
       (document_id, token, password_hash, allow_download, expires_at, created_by, revoked)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        ctx.documentId,
        token,
        passwordHash,
        allowDownload ? 1 : 0,
        expiresAt ? new Date(expiresAt) : null,
        req.user.id,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      action: "documents.public_link.create",
      entityType: "document",
      entityId: String(ctx.documentId),
      metadata: { linkId: ins.rows.insertId, hasPassword: Boolean(passwordHash), allowDownload },
      ipAddress: req.ip,
    });

    const paths = linkPublicPaths(token);
    return res.status(201).json({
      success: true,
      data: {
        id: ins.rows.insertId,
        token,
        hasPassword: Boolean(passwordHash),
        allow_download: allowDownload,
        expires_at: expiresAt,
        paths,
        hint: "Conservez le token : il ne sera plus affiché en intégralité après cette réponse.",
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.patch("/:linkId/revoke", async (req, res, next) => {
  try {
    const ctx = await assertCanManage(req, res);
    if (!ctx) return;
    const linkId = Number(req.params.linkId);

    const existing = await query(
      "SELECT id FROM public_links WHERE id = ? AND document_id = ?",
      [linkId, ctx.documentId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lien introuvable" });
    }

    await query("UPDATE public_links SET revoked = 1 WHERE id = ?", [linkId]);

    await logAudit({
      actorId: req.user.id,
      action: "documents.public_link.revoke",
      entityType: "document",
      entityId: String(ctx.documentId),
      metadata: { linkId },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: "Lien désactivé" });
  } catch (e) {
    return next(e);
  }
});

router.get("/:linkId/logs", async (req, res, next) => {
  try {
    const ctx = await assertCanManage(req, res);
    if (!ctx) return;
    const linkId = Number(req.params.linkId);

    const exists = await query(
      "SELECT id FROM public_links WHERE id = ? AND document_id = ?",
      [linkId, ctx.documentId]
    );
    if (exists.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lien introuvable" });
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = (page - 1) * limit;

    const rows = await query(
      `SELECT id, link_id, ip_address, user_agent, action, accessed_at
       FROM link_access_logs
       WHERE link_id = ?
       ORDER BY accessed_at DESC
       LIMIT ? OFFSET ?`,
      [linkId, limit, offset]
    );

    const countRow = await query(
      "SELECT COUNT(*) AS total FROM link_access_logs WHERE link_id = ?",
      [linkId]
    );

    return res.json({
      success: true,
      data: rows.rows,
      page,
      limit,
      total: Number(countRow.rows[0]?.total || 0),
    });
  } catch (e) {
    return next(e);
  }
});

router.patch("/:linkId/regenerate", async (req, res, next) => {
  try {
    const ctx = await assertCanManage(req, res);
    if (!ctx) return;
    const linkId = Number(req.params.linkId);

    const row = await query(
      "SELECT * FROM public_links WHERE id = ? AND document_id = ?",
      [linkId, ctx.documentId]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lien introuvable" });
    }

    const cur = row.rows[0];
    const newToken = generateOpaqueToken();

    const password = req.body.password != null ? String(req.body.password) : null;
    const expiresAt = req.body.expiresAt ?? req.body.expires_at ?? cur.expires_at;
    const allowDownload =
      req.body.allowDownload !== undefined
        ? req.body.allowDownload !== false
        : req.body.allow_download !== undefined
          ? req.body.allow_download !== false
          : Boolean(cur.allow_download);

    let passwordHash = cur.password_hash;
    if (password === "") {
      passwordHash = null;
    } else if (password && password.length > 0) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    await query(
      `UPDATE public_links
       SET token = ?, password_hash = ?, allow_download = ?, expires_at = ?, revoked = 0
       WHERE id = ?`,
      [
        newToken,
        passwordHash,
        allowDownload ? 1 : 0,
        expiresAt ? new Date(expiresAt) : null,
        linkId,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      action: "documents.public_link.regenerate",
      entityType: "document",
      entityId: String(ctx.documentId),
      metadata: { linkId },
      ipAddress: req.ip,
    });

    const paths = linkPublicPaths(newToken);
    return res.json({
      success: true,
      data: {
        id: linkId,
        token: newToken,
        paths,
        message: "Nouveau jeton généré ; les anciennes URL ne fonctionnent plus.",
      },
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
