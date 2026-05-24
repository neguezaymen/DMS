const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const { sendEmail } = require("../../services/mailer");
const { createNotification } = require("../notifications/notifications.service");
const {
  assertRequestRowActive,
  normalizeAllowedMimes,
  mimeAllowed,
  issueUploadSessionJwt,
  verifyUploadSessionJwt,
  loadRequestByToken,
  countOpenSlotsUsed,
} = require("./upload-requests.service");

const router = express.Router();

const uploadDir = path.resolve(__dirname, "../../../uploads/request-uploads");
fs.mkdirSync(uploadDir, { recursive: true });

function bearer(req) {
  const h = req.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

router.get("/:token/meta", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const row = await loadRequestByToken(urlToken);
    const check = assertRequestRowActive(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }
    const allowed = normalizeAllowedMimes(row.allowed_mime_types);
    return res.json({
      success: true,
      data: {
        expires_at: row.expires_at,
        max_size_bytes: row.max_size_bytes,
        max_files: row.max_files,
        requires_password: Boolean(row.password_hash),
        allowed_mime_types: allowed,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/:token/grant", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const row = await loadRequestByToken(urlToken);
    const check = assertRequestRowActive(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    const password = req.body?.password != null ? String(req.body.password) : "";
    if (row.password_hash) {
      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) {
        return res.status(401).json({ success: false, message: "Mot de passe incorrect" });
      }
    }

    const accessToken = issueUploadSessionJwt({
      requestId: row.id,
      token: urlToken,
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: 7200,
      },
    });
  } catch (e) {
    return next(e);
  }
});

function multerPromise(upload, req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.post("/:token/upload", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const token = bearer(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Jeton d’accès requis (Authorization: Bearer)" });
    }
    const decoded = verifyUploadSessionJwt(token, urlToken);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Jeton invalide ou expiré" });
    }

    const row = await loadRequestByToken(urlToken);
    const check = assertRequestRowActive(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }
    if (Number(decoded.requestId) !== Number(row.id)) {
      return res.status(403).json({ success: false, message: "Jeton incompatible" });
    }

    const allowed = normalizeAllowedMimes(row.allowed_mime_types);
    const maxSize = Math.min(Number(row.max_size_bytes) || 10485760, 50 * 1024 * 1024);
    const maxFiles = Math.min(Number(row.max_files) || 5, 50);

    const existing = await countOpenSlotsUsed(row.id);

    const upload = multer({
      storage: multer.diskStorage({
        destination: (_r, _f, cb) => cb(null, uploadDir),
        filename: (_r, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
        },
      }),
      limits: { fileSize: maxSize, files: maxFiles },
    }).array("files", maxFiles);

    try {
      await multerPromise(upload, req, res);
    } catch (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: `Fichier trop volumineux (max ${maxSize} octets)`,
        });
      }
      throw err;
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: "Aucun fichier" });
    }

    if (existing + files.length > maxFiles) {
      for (const f of files) {
        try {
          await fs.promises.unlink(f.path);
        } catch {
          // ignore
        }
      }
      return res.status(400).json({
        success: false,
        message: `Nombre maximal de fichiers dépassé (${maxFiles} au total pour ce lien)`,
      });
    }

    const email = req.body?.email != null ? String(req.body.email).trim().slice(0, 255) : "";
    const comment = req.body?.comment != null ? String(req.body.comment).slice(0, 4000) : "";

    const uploaded = [];
    for (const file of files) {
      const mt = file.mimetype || "application/octet-stream";
      if (!mimeAllowed(mt, allowed)) {
        for (const f of files) {
          try {
            await fs.promises.unlink(f.path);
          } catch {
            // ignore
          }
        }
        return res.status(400).json({
          success: false,
          message: `Type non autorisé : ${mt}`,
        });
      }

      const ins = await query(
        `INSERT INTO upload_request_files
         (request_id, original_name, file_path, size, mime_type, uploaded_by_ip, uploaded_by_email, comment, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          row.id,
          file.originalname,
          file.path,
          file.size,
          mt,
          req.ip || null,
          email || null,
          comment || null,
        ]
      );
      uploaded.push({ id: ins.rows.insertId, original_name: file.originalname, size: file.size });
    }

    await logAudit({
      actorId: null,
      action: "upload_request.external_upload",
      entityType: "upload_request",
      entityId: String(row.id),
      metadata: {
        fileIds: uploaded.map((u) => u.id),
        ip: req.ip,
        email: email || null,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    await createNotification({
      userId: row.created_by,
      type: "upload",
      title: "Nouveaux documents reçus",
      message: `${uploaded.length} fichier(s) ont été déposés sur votre demande #${row.id}.`,
      link: "/upload-requests",
    });

    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: "Accusé de réception — documents transmis",
          text: `Vos fichier(s) ont bien été reçus. Référence demande #${row.id}.`,
          html: `<p>Vos fichier(s) ont bien été reçus.</p><p>Référence demande #${row.id}.</p>`,
        });
      } catch {
        // SMTP optionnel
      }
    }

    if (row.notification_email) {
      try {
        await sendEmail({
          to: row.notification_email,
          subject: `Nouveau dépôt — demande #${row.id}`,
          text: `${uploaded.length} fichier(s) reçu(s).`,
          html: `<p>${uploaded.length} fichier(s) reçu(s) pour la demande #${row.id}.</p>`,
        });
      } catch {
        // ignore
      }
    }

    return res.status(201).json({
      success: true,
      message: "Fichiers reçus. Ils seront examinés sous peu.",
      data: { uploaded },
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
