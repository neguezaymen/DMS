const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const bcrypt = require("bcryptjs");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const { sendEmail } = require("../../services/mailer");
const { toDocumentDto } = require("../documents/documents.service");
const { queueTextExtraction } = require("../../jobs/extract-text.job");
const {
  generateOpaqueToken,
  validateCreateUploadRequest,
  canReviewUploadRequest,
  normalizeAllowedMimes,
  loadRequestByToken,
  assertRequestRowActive,
  markExpiredIfNeeded,
} = require("./upload-requests.service");

const router = express.Router();

async function buildFileRowWithRequest(fileId) {
  const r = await query(
    `SELECT f.*, r.id AS request_id, r.token, r.created_by, r.target_document_id, r.status AS request_status
     FROM upload_request_files f
     JOIN upload_requests r ON r.id = f.request_id
     WHERE f.id = ?`,
    [fileId]
  );
  return r.rows[0] || null;
}

/** POST / — créer un lien d'upload */
router.post("/", async (req, res, next) => {
  try {
    const check = await validateCreateUploadRequest(req.user, req.body.targetDocumentId);
    if (!check.ok) {
      return res.status(check.status).json({
        success: false,
        message: check.message,
      });
    }
    const targetId = check.targetDocumentId;

    const password = req.body.password != null ? String(req.body.password) : "";
    const notificationEmail =
      req.body.notificationEmail != null ? String(req.body.notificationEmail).trim().slice(0, 255) : "";

    let passwordHash = null;
    if (password.length > 0) passwordHash = await bcrypt.hash(password, 12);

    const token = generateOpaqueToken();
    const maxSize = Math.min(Number(req.body.maxSizeBytes) || 10485760, 50 * 1024 * 1024);
    const maxFiles = Math.min(Number(req.body.maxFiles) || 5, 50);
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

    let allowedMimeTypes = null;
    if (req.body.allowedMimeTypes != null) {
      allowedMimeTypes =
        typeof req.body.allowedMimeTypes === "string"
          ? req.body.allowedMimeTypes
          : JSON.stringify(req.body.allowedMimeTypes);
    }

    const ins = await query(
      `INSERT INTO upload_requests
       (token, created_by, target_document_id, allowed_mime_types, max_size_bytes, max_files,
        expires_at, password_hash, status, notification_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        token,
        req.user.id,
        Number.isFinite(targetId) ? targetId : null,
        allowedMimeTypes,
        maxSize,
        maxFiles,
        expiresAt,
        passwordHash,
        notificationEmail || null,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      action: "upload_request.create",
      entityType: "upload_request",
      entityId: String(ins.rows.insertId),
      metadata: {
        targetDocumentId: Number.isFinite(targetId) ? targetId : null,
        maxFiles,
        maxSizeBytes: maxSize,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    const base = `${req.protocol}://${req.get("host")}`;
    return res.status(201).json({
      success: true,
      data: {
        id: ins.rows.insertId,
        token,
        publicUrl: `${base}/request-upload/${encodeURIComponent(token)}`,
        apiMetaUrl: `${base}/api/v1/request-upload/${encodeURIComponent(token)}/meta`,
      },
    });
  } catch (e) {
    return next(e);
  }
});

/** GET /mine — liens créés par moi */
router.get("/mine", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT ur.*,
              (SELECT COUNT(*) FROM upload_request_files f WHERE f.request_id = ur.id AND f.status = 'pending') AS pending_count
       FROM upload_requests ur
       WHERE ur.created_by = ?
       ORDER BY ur.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (e) {
    return next(e);
  }
});

/** GET /inbox — fichiers en attente (visibles selon droits) */
router.get("/inbox", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT f.*, ur.token, ur.created_by, ur.target_document_id, ur.status AS request_status, ur.expires_at,
              u.full_name AS created_by_name, d.title AS target_title
       FROM upload_request_files f
       JOIN upload_requests ur ON ur.id = f.request_id
       JOIN users u ON u.id = ur.created_by
       LEFT JOIN documents d ON d.id = ur.target_document_id
       WHERE f.status IN ('pending', 'correction_requested')
       ORDER BY f.uploaded_at DESC`
    );

    const out = [];
    for (const row of rows.rows) {
      const ur = {
        id: row.request_id,
        created_by: row.created_by,
        target_document_id: row.target_document_id,
        status: row.request_status,
      };
      if (await canReviewUploadRequest(req.user, ur)) {
        out.push({
          id: row.id,
          request_id: row.request_id,
          original_name: row.original_name,
          size: row.size,
          mime_type: row.mime_type,
          status: row.status,
          uploaded_by_ip: row.uploaded_by_ip,
          uploaded_by_email: row.uploaded_by_email,
          comment: row.comment,
          uploaded_at: row.uploaded_at,
          reviewer_comment: row.reviewer_comment,
          token: row.token,
          target_title: row.target_title,
          link_creator_name: row.created_by_name,
        });
      }
    }
    return res.json({ success: true, data: out });
  } catch (e) {
    return next(e);
  }
});

/** POST /files/:fileId/approve */
router.post("/files/:fileId/approve", async (req, res, next) => {
  try {
    const fileId = Number(req.params.fileId);
    const row = await buildFileRowWithRequest(fileId);
    if (!row) return res.status(404).json({ success: false, message: "Fichier introuvable" });

    let reqRow = await query(`SELECT * FROM upload_requests WHERE id = ?`, [row.request_id]);
    reqRow = await markExpiredIfNeeded(reqRow.rows[0]);
    const okRev = await canReviewUploadRequest(req.user, reqRow);
    if (!okRev) return res.status(403).json({ success: false, message: "Accès refusé" });

    if (!["pending", "correction_requested"].includes(row.status)) {
      return res.status(400).json({ success: false, message: "Fichier déjà traité" });
    }

    let ownerId = reqRow.created_by;
    let category = "General";
    if (reqRow.target_document_id) {
      const doc = await query("SELECT owner_id, category FROM documents WHERE id = ?", [
        reqRow.target_document_id,
      ]);
      if (doc.rows.length) {
        ownerId = doc.rows[0].owner_id;
        category = doc.rows[0].category || "General";
      }
    }

    const title = path.parse(row.original_name).name || row.original_name;
    const ins = await query(
      `INSERT INTO documents
       (title, original_name, file_path, mime_type, size, owner_id, category, status, tags, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?)`,
      [
        title,
        row.original_name,
        row.file_path,
        row.mime_type || "application/octet-stream",
        row.size,
        ownerId,
        category,
        `Reçu via demande d'upload #${row.request_id}`,
      ]
    );
    const newDocId = ins.rows.insertId;

    await query(
      `UPDATE upload_request_files
       SET status = 'approved', reviewed_at = NOW(), reviewed_by = ?, integrated_document_id = ?
       WHERE id = ?`,
      [req.user.id, newDocId, fileId]
    );

    await logAudit({
      actorId: req.user.id,
      action: "upload_request.approve",
      entityType: "upload_request_file",
      entityId: String(fileId),
      metadata: { documentId: newDocId, requestId: row.request_id },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    queueTextExtraction({
      documentId: newDocId,
      filePath: row.file_path,
      mimeType: row.mime_type,
      originalName: row.original_name,
    });

    const created = await query(
      `SELECT d.*, u.full_name AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.id = ?`,
      [newDocId]
    );

    return res.json({
      success: true,
      data: { document: toDocumentDto(created.rows[0]) },
    });
  } catch (e) {
    return next(e);
  }
});

/** POST /files/:fileId/reject */
router.post("/files/:fileId/reject", async (req, res, next) => {
  try {
    const fileId = Number(req.params.fileId);
    const comment = req.body?.comment != null ? String(req.body.comment).slice(0, 4000) : "";

    const row = await buildFileRowWithRequest(fileId);
    if (!row) return res.status(404).json({ success: false, message: "Fichier introuvable" });

    let reqRow = await query(`SELECT * FROM upload_requests WHERE id = ?`, [row.request_id]);
    reqRow = await markExpiredIfNeeded(reqRow.rows[0]);
    const okRev = await canReviewUploadRequest(req.user, reqRow);
    if (!okRev) return res.status(403).json({ success: false, message: "Accès refusé" });

    if (!["pending", "correction_requested"].includes(row.status)) {
      return res.status(400).json({ success: false, message: "Fichier déjà traité" });
    }

    try {
      await fs.unlink(row.file_path);
    } catch {
      // absent
    }

    await query(
      `UPDATE upload_request_files
       SET status = 'rejected', reviewer_comment = ?, reviewed_at = NOW(), reviewed_by = ?
       WHERE id = ?`,
      [comment || null, req.user.id, fileId]
    );

    await logAudit({
      actorId: req.user.id,
      action: "upload_request.reject",
      entityType: "upload_request_file",
      entityId: String(fileId),
      metadata: { requestId: row.request_id, comment },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    if (row.uploaded_by_email) {
      try {
        await sendEmail({
          to: row.uploaded_by_email,
          subject: "Document non retenu",
          text: comment ? `Votre envoi a été refusé. Motif : ${comment}` : "Votre envoi a été refusé.",
          html: `<p>Votre envoi a été refusé.</p>${comment ? `<p>${comment}</p>` : ""}`,
        });
      } catch {
        // ignore
      }
    }

    return res.json({ success: true, message: "Rejet enregistré" });
  } catch (e) {
    return next(e);
  }
});

/** POST /files/:fileId/request-correction */
router.post("/files/:fileId/request-correction", async (req, res, next) => {
  try {
    const fileId = Number(req.params.fileId);
    const comment = req.body?.comment != null ? String(req.body.comment).slice(0, 4000) : "";
    if (!comment) {
      return res.status(400).json({ success: false, message: "Commentaire requis" });
    }

    const row = await buildFileRowWithRequest(fileId);
    if (!row) return res.status(404).json({ success: false, message: "Fichier introuvable" });

    let reqRow = await query(`SELECT * FROM upload_requests WHERE id = ?`, [row.request_id]);
    reqRow = await markExpiredIfNeeded(reqRow.rows[0]);
    const okRev = await canReviewUploadRequest(req.user, reqRow);
    if (!okRev) return res.status(403).json({ success: false, message: "Accès refusé" });

    if (!["pending", "correction_requested"].includes(row.status)) {
      return res.status(400).json({ success: false, message: "Fichier déjà traité" });
    }

    await query(
      `UPDATE upload_request_files
       SET status = 'correction_requested', reviewer_comment = ?, reviewed_at = NOW(), reviewed_by = ?
       WHERE id = ?`,
      [comment, req.user.id, fileId]
    );

    await logAudit({
      actorId: req.user.id,
      action: "upload_request.correction_requested",
      entityType: "upload_request_file",
      entityId: String(fileId),
      metadata: { requestId: row.request_id, comment },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    if (row.uploaded_by_email) {
      try {
        await sendEmail({
          to: row.uploaded_by_email,
          subject: "Correction demandée sur votre envoi",
          text: comment,
          html: `<p>${comment}</p>`,
        });
      } catch {
        // ignore
      }
    }

    return res.json({ success: true, message: "Demande de correction enregistrée" });
  } catch (e) {
    return next(e);
  }
});

/** PATCH /:id/revoke */
router.patch("/:id/revoke", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await query(`SELECT * FROM upload_requests WHERE id = ?`, [id]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: "Introuvable" });
    const ur = r.rows[0];
    if (String(ur.created_by) !== String(req.user.id) && !(await canReviewUploadRequest(req.user, ur))) {
      return res.status(403).json({ success: false, message: "Accès refusé" });
    }

    await query(`UPDATE upload_requests SET status = 'revoked' WHERE id = ?`, [id]);

    await logAudit({
      actorId: req.user.id,
      action: "upload_request.revoke",
      entityType: "upload_request",
      entityId: String(id),
      metadata: {},
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.json({ success: true, message: "Lien révoqué" });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
