const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const env = require("../../config/env");
const { authenticate, requireAdmin, isAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const {
  insertUploadedDocuments,
  toDocumentDto,
  getDashboardStats,
  duplicateDocument,
  deleteDocumentPermanent,
  purgeDeletedDocuments,
} = require("./documents.service");
const { detectSensitiveInUpload } = require("./upload-risk.service");
const settingsService = require("../settings/settings.service");
const { sendEmail } = require("../../services/mailer");
const { searchDocuments } = require("./search.service");
const {
  generateDocumentEmbedding,
  queueDocumentEmbedding,
  searchDocumentsVector,
} = require("./embedding.service");
const { queueTextExtraction } = require("../../jobs/extract-text.job");
const {
  documentsVisibleSql,
  resolveDocumentAccess,
  assertMinAccess,
  getDocumentWithAccess,
} = require("./document-access.service");
const { notifyDocumentOwner } = require("../notifications/notifications.service");
const { toJsonSafeDeep } = require("../../utils/jsonSafe");
const sharesRouter = require("./document-shares.routes");
const publicLinksManageRouter = require("./document-public-links.routes");
const {
  shouldWatermarkPdfDownload,
  applyPdfWatermarkFromFile,
} = require("./pdf-watermark.service");

const router = express.Router();
const uploadDir = path.resolve(__dirname, "../../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  },
});

function multerArrayDynamic() {
  return async (req, res, next) => {
    try {
      const max = await settingsService.getMaxUploadBytes();
      multer({ storage, limits: { fileSize: max } }).array("files", 10)(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

function multerSingleDynamic() {
  return async (req, res, next) => {
    try {
      const max = await settingsService.getMaxUploadBytes();
      multer({ storage, limits: { fileSize: max } }).single("file")(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

const uploadFilesMiddleware = multerArrayDynamic();
const uploadSingleMiddleware = multerSingleDynamic();

function isOfficePreviewableMime(mime) {
  const m = (mime || "").toLowerCase();
  const exact = new Set([
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
  if (exact.has(m)) return true;
  return (
    m.includes("officedocument") ||
    m.includes("wordprocessingml") ||
    m.includes("spreadsheetml") ||
    m.includes("presentationml") ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.ms-powerpoint"
  );
}

function buildPublicApiBase() {
  const port = env.port || 3000;
  const raw = String(env.app.publicApiUrl || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  return `http://localhost:${port}`;
}

/**
 * Jeton preview_tokens (5 min) + URLs stream et embed Office Online.
 * @returns {Promise<{ data?: object, error?: { status: number, body: object } }>}
 */
async function mintOfficePreviewUrlsForUser(user, documentId) {
  const ctx = await getDocumentWithAccess(user, documentId);
  if (ctx.error) return ctx;
  if (!assertMinAccess(ctx.access, "view")) {
    return { error: { status: 403, body: { success: false, message: "Access denied" } } };
  }
  const row = ctx.docRow;
  if (row.deleted_at) {
    return { error: { status: 404, body: { success: false, message: "Not found" } } };
  }
  if (!isOfficePreviewableMime(row.mime_type)) {
    return {
      error: {
        status: 400,
        body: {
          success: false,
          message: "Ce type de fichier ne prend pas en charge l’aperçu Office en ligne",
        },
      },
    };
  }
  await query("DELETE FROM preview_tokens WHERE expires_at < NOW()");
  const token = crypto.randomBytes(32).toString("hex");
  await query(
    `INSERT INTO preview_tokens (document_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
    [documentId, token]
  );
  const publicBase = buildPublicApiBase();
  const streamUrl = `${publicBase}/api/v1/documents/preview-office/${token}`;
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(streamUrl)}`;
  const expRow = await query("SELECT expires_at FROM preview_tokens WHERE token = ?", [token]);
  const expiresAt = expRow.rows[0]?.expires_at
    ? new Date(expRow.rows[0].expires_at).toISOString()
    : new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    data: {
      publicUrl: streamUrl,
      embedUrl,
      expiresAt,
    },
  };
}

const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function toRecipientList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

/** Recherche sémantique (pgvector / MySQL / lexique) — toujours 200, repli classique si besoin */
router.post("/search-vector", authenticate, async (req, res) => {
  const q = req.body?.q || req.query?.q || "";
  const limit = req.body?.limit || req.query?.limit || 15;
  const result = await searchDocumentsVector({
    q,
    user: req.user,
    limit,
  });
  return res.json({
    success: true,
    data: result.data,
    meta: {
      mode: result.mode,
      scores: result.scores,
      fallback: Boolean(result.fallback),
      hint: result.fallback
        ? "Recherche classique ou lexique sémantique (pgvector / embeddings optionnels)"
        : undefined,
    },
  });
});

/** Génère / régénère l'embedding d'un document */
router.post("/:id/embedding", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) {
      return res.status(400).json({ success: false, message: "Invalid document id" });
    }
    const access = await getDocumentWithAccess(documentId, req.user);
    if (!access?.document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    const result = await generateDocumentEmbedding(documentId);
    if (!result.ok) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.get("/search", authenticate, async (req, res, next) => {
  try {
    const admin = isAdmin(req.user);
    const result = await searchDocuments({
      q: req.query.q || "",
      category: req.query.category,
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      page: req.query.page,
      limit: req.query.limit,
      scopeUser: admin ? null : req.user,
      departmentId: req.query.departmentId || null,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
});

/** Documents en attente d'approbation (admin). */
router.get("/pending", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT d.*, u.full_name AS owner_name, u.email AS owner_email
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.status = 'pending_approval' AND d.deleted_at IS NULL
       ORDER BY d.created_at ASC`
    );
    return res.json({ success: true, data: rows.rows.map(toDocumentDto) });
  } catch (error) {
    return next(error);
  }
});

/** Catégories distinctes visibles pour l'utilisateur (documents non supprimés). */
router.get("/categories", authenticate, async (req, res, next) => {
  try {
    const vis = documentsVisibleSql(req.user);
    const rows = await query(
      `SELECT DISTINCT TRIM(d.category) AS category
       FROM documents d
       WHERE d.deleted_at IS NULL
         AND d.category IS NOT NULL
         AND TRIM(d.category) <> ''
         AND (${vis.sql})
       ORDER BY category ASC`,
      vis.params
    );
    const list = rows.rows.map((r) => r.category).filter(Boolean);
    const defaults = ["General", "Général"];
    const merged = [...new Set([...list, ...defaults])];
    merged.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    return res.json({ success: true, data: merged });
  } catch (error) {
    return next(error);
  }
});

router.get("/", authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const textQuery = String(req.query.q || req.query.search || "").trim();

    const filters = [];
    const params = [];
    if (!isAdmin(req.user)) {
      const vis = documentsVisibleSql(req.user);
      filters.push(`(${vis.sql})`);
      params.push(...vis.params);
    }
    if (req.query.ownerId && (isAdmin(req.user) || String(req.query.ownerId) === String(req.user.id))) {
      filters.push("d.owner_id = ?");
      params.push(Number(req.query.ownerId));
    }
    if (textQuery) {
      filters.push(
        `(
          d.title LIKE ?
          OR d.original_name LIKE ?
          OR d.description LIKE ?
          OR d.tags LIKE ?
        )`
      );
      const like = `%${textQuery}%`;
      params.push(like, like, like, like);
    }
    if (req.query.category) {
      filters.push("d.category = ?");
      params.push(req.query.category);
    }
    if (req.query.status) {
      filters.push("d.status = ?");
      params.push(req.query.status);
    } else {
      filters.push("d.status <> 'deleted'");
    }
    if (String(req.query.archivable || "") === "1") {
      filters.push("d.status = 'active'");
      filters.push("d.updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)");
    }
    if (req.query.departmentId) {
      const departmentId = Number(req.query.departmentId);
      if (!Number.isFinite(departmentId) || departmentId <= 0) {
        return res.status(400).json({ success: false, message: "Département invalide" });
      }
      filters.push(
        `EXISTS (
           SELECT 1 FROM user_departments ud
           WHERE ud.user_id = d.owner_id
             AND ud.department_id = ?
         )`
      );
      params.push(departmentId);
    }
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const safeOffset = Number.isFinite(offset) ? offset : 0;
    const safeLimit = Number.isFinite(limit) ? limit : 10;
    const listSql = `SELECT d.*, u.full_name AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT ${safeOffset}, ${safeLimit}`;
    const listParams = [...params];
    console.log("[DEBUG] SQL:", listSql);
    console.log("[DEBUG] Params:", listParams);
    const rows = await query(listSql, listParams);

    const countSql = `SELECT COUNT(*) AS total
       FROM documents d
       ${whereClause}`;
    console.log("[DEBUG] SQL:", countSql);
    console.log("[DEBUG] Params:", params);
    const countRow = await query(countSql, params);

    return res.json({
      success: true,
      data: rows.rows.map(toDocumentDto),
      pagination: {
        page,
        limit,
        total: Number(countRow.rows[0].total),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/archivable", authenticate, async (req, res, next) => {
  try {
    const filters = ["d.status = 'active'", "d.updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)"];
    const params = [];
    if (!isAdmin(req.user)) {
      const vis = documentsVisibleSql(req.user);
      filters.push(`(${vis.sql})`);
      params.push(...vis.params);
    }
    const whereClause = `WHERE ${filters.join(" AND ")}`;
    const rows = await query(
      `SELECT d.id, d.title, d.updated_at, d.owner_id
       FROM documents d
       ${whereClause}
       ORDER BY d.updated_at ASC
       LIMIT 5`,
      params
    );
    const countRow = await query(
      `SELECT COUNT(*) AS total
       FROM documents d
       ${whereClause}`,
      params
    );
    const payload = {
      count: Number(countRow.rows[0]?.total || 0),
      documents: rows.rows,
    };
    return res.json({
      success: true,
      ...payload,
      data: payload,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/archive-batch", authenticate, async (req, res, next) => {
  try {
    const providedIds = Array.isArray(req.body?.documentIds)
      ? req.body.documentIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    let rows = [];
    if (providedIds.length > 0) {
      const placeholders = providedIds.map(() => "?").join(",");
      const filters = [
        `d.id IN (${placeholders})`,
        "d.status = 'active'",
        "d.updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)",
      ];
      const params = [...providedIds];
      if (!isAdmin(req.user)) {
        filters.push("d.owner_id = ?");
        params.push(req.user.id);
      }
      const sel = await query(
        `SELECT d.id, d.owner_id
         FROM documents d
         WHERE ${filters.join(" AND ")}`,
        params
      );
      rows = sel.rows;
    } else {
      const filters = ["d.status = 'active'", "d.updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)"];
      const params = [];
      if (!isAdmin(req.user)) {
        filters.push("d.owner_id = ?");
        params.push(req.user.id);
      }
      const sel = await query(
        `SELECT d.id, d.owner_id
         FROM documents d
         WHERE ${filters.join(" AND ")}`,
        params
      );
      rows = sel.rows;
    }

    if (rows.length === 0) {
      return res.json({ success: true, data: { archived: 0 } });
    }

    const ids = rows.map((r) => Number(r.id));
    await query(`UPDATE documents SET status = 'archived' WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    await logAudit({
      actorId: req.user.id,
      action: "documents.archive.batch",
      entityType: "document",
      metadata: { count: ids.length, documentIds: ids },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { archived: ids.length, documentIds: ids } });
  } catch (error) {
    return next(error);
  }
});

router.get("/stats", authenticate, async (req, res, next) => {
  try {
    const data = await getDashboardStats({
      user: req.user,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.get("/trash", authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const safeOffset = Number.isFinite(offset) ? offset : 0;
    const safeLimit = Number.isFinite(limit) ? limit : 20;
    const filters = ["d.status = 'deleted'"];
    const params = [];
    if (!isAdmin(req.user)) {
      filters.push("d.owner_id = ?");
      params.push(req.user.id);
    }
    const whereClause = `WHERE ${filters.join(" AND ")}`;
    const rows = await query(
      `SELECT d.*, u.full_name AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       ${whereClause}
       ORDER BY d.deleted_at DESC, d.updated_at DESC
       LIMIT ${safeOffset}, ${safeLimit}`,
      params
    );
    const countRow = await query(
      `SELECT COUNT(*) AS total
       FROM documents d
       ${whereClause}`,
      params
    );
    return res.json({
      success: true,
      data: rows.rows.map(toDocumentDto),
      pagination: {
        page,
        limit,
        total: Number(countRow.rows[0]?.total || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/trash/empty", authenticate, async (req, res, next) => {
  try {
    const filters = ["status = 'deleted'"];
    const params = [];
    if (!isAdmin(req.user)) {
      filters.push("owner_id = ?");
      params.push(req.user.id);
    }
    const rows = await query(`SELECT id FROM documents WHERE ${filters.join(" AND ")}`, params);
    let deleted = 0;
    for (const r of rows.rows) {
      const result = await deleteDocumentPermanent(Number(r.id));
      if (result.deleted) deleted += 1;
    }
    await logAudit({
      actorId: req.user.id,
      action: "documents.trash.empty",
      entityType: "document",
      metadata: { deleted },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    return next(error);
  }
});

router.use("/:id/shares", authenticate, sharesRouter);
router.use("/:id/public-links", authenticate, publicLinksManageRouter);

/** CORS minimal pour le viewer Microsoft (requête GET cross-origin). */
router.options("/preview-office/:token", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.sendStatus(204);
});

/** Lecture fichier pour Office Online : jeton preview_tokens (pas de session). */
router.get("/preview-office/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ success: false, message: "Invalid token" });
    }
    await query("DELETE FROM preview_tokens WHERE expires_at < NOW()");
    const found = await query(
      `SELECT d.file_path, d.mime_type, d.original_name, d.deleted_at, d.status
       FROM preview_tokens pt
       INNER JOIN documents d ON d.id = pt.document_id
       WHERE pt.token = ? AND pt.expires_at > NOW()`,
      [token]
    );
    if (!found.rows.length) {
      return res.status(403).json({ success: false, message: "Invalid or expired preview link" });
    }
    const row = found.rows[0];
    if (row.deleted_at || row.status === "deleted") {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const abs = path.resolve(row.file_path);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
    return res.sendFile(abs, (err) => {
      if (err) next(err);
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/custom-values", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const category = ctx.docRow.category || "";
    let fields;
    try {
      fields = await query(
        `SELECT id, name, type, options, document_type
         FROM custom_fields
         WHERE is_active = 1
           AND (document_type IS NULL OR document_type = '' OR document_type = ?)
         ORDER BY name`,
        [category]
      );
    } catch (fieldErr) {
      // eslint-disable-next-line no-console
      console.error(
        "[documents/:id/custom-values GET] custom_fields requête complète échouée, repli minimal:",
        fieldErr?.message || fieldErr
      );
      fields = await query(
        `SELECT id, name, type
         FROM custom_fields
         WHERE is_active = 1
         ORDER BY name`
      );
    }
    let vals = { rows: [] };
    try {
      vals = await query("SELECT field_id, value FROM document_custom_values WHERE document_id = ?", [
        documentId,
      ]);
    } catch (ve) {
      // eslint-disable-next-line no-console
      console.error("[documents/:id/custom-values GET] document_custom_values:", ve?.message || ve);
    }
    const valueMap = {};
    for (const v of vals.rows) {
      valueMap[v.field_id] = v.value;
    }
    return res.json(toJsonSafeDeep({ success: true, data: { fields: fields.rows, values: valueMap } }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[documents/:id/custom-values GET]", error?.message || error, error?.stack);
    return next(error);
  }
});

router.put("/:id/custom-values", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "manage")) {
      return res.status(403).json({
        success: false,
        message: "Permission « manage » requise pour modifier les champs personnalisés",
      });
    }
    const values = req.body.values && typeof req.body.values === "object" ? req.body.values : {};
    for (const [fid, val] of Object.entries(values)) {
      await query(
        `INSERT INTO document_custom_values (document_id, field_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [documentId, Number(fid), val != null ? String(val) : null]
      );
    }
    await logAudit({
      actorId: req.user.id,
      action: "documents.custom_values.update",
      entityType: "document",
      entityId: String(documentId),
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Enregistré" });
  } catch (error) {
    return next(error);
  }
});

/** Changer la catégorie d'un document (propriétaire / droit « manage »). */
router.put("/:id/category", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const raw = req.body.category ?? req.body.categoryName;
    const category = String(raw || "").trim();
    if (!category) {
      return res.status(400).json({ success: false, message: "La catégorie est requise" });
    }
    if (category.length > 120) {
      return res.status(400).json({ success: false, message: "Catégorie trop longue (120 caractères max)" });
    }

    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "manage")) {
      return res.status(403).json({
        success: false,
        message: "Permission de gestion requise pour modifier la catégorie",
      });
    }

    const previous = String(ctx.docRow.category || "").trim();
    if (previous === category) {
      return res.json({ success: true, data: { category } });
    }

    await query("UPDATE documents SET category = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL", [
      category,
      documentId,
    ]);

    await logAudit({
      actorId: req.user.id,
      action: "documents.category.update",
      entityType: "document",
      entityId: String(documentId),
      metadata: {
        previousCategory: previous,
        newCategory: category,
        title: ctx.docRow.title,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.json({ success: true, data: { category } });
  } catch (error) {
    return next(error);
  }
});

/** Activer / désactiver le filigrane PDF au téléchargement (documents publics ; les privés sont filigranés automatiquement). */
router.put("/:id/watermark", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      return res.status(400).json({ success: false, message: "Identifiant de document invalide" });
    }
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Le corps doit contenir enabled (booléen)",
      });
    }
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "manage")) {
      return res.status(403).json({
        success: false,
        message: "Permission de gestion requise pour modifier le filigrane",
      });
    }
    const mime = String(ctx.docRow.mime_type || "").toLowerCase();
    if (mime !== "application/pdf") {
      return res.status(400).json({
        success: false,
        message: "Le filigrane ne s’applique qu’aux fichiers PDF",
      });
    }
    const enabled = req.body.enabled ? 1 : 0;
    await query("UPDATE documents SET watermark_enabled = ?, updated_at = NOW() WHERE id = ?", [
      enabled,
      documentId,
    ]);
    await logAudit({
      actorId: req.user.id,
      action: "documents.watermark.setting",
      entityType: "document",
      entityId: String(documentId),
      metadata: { enabled: Boolean(enabled), title: ctx.docRow.title },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });
    return res.json({ success: true, data: { watermark_enabled: Boolean(enabled) } });
  } catch (error) {
    return next(error);
  }
});

const MAX_DOCUMENT_COMMENT_LENGTH = 8000;

/** Liste des commentaires (accès lecture au document requis). */
router.get("/:id/comments", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      return res.status(400).json({ success: false, message: "Identifiant de document invalide" });
    }
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const rows = await query(
      `SELECT c.id, c.document_id, c.user_id, c.comment, c.created_at, c.updated_at,
              u.full_name AS author_name, u.email AS author_email
       FROM document_comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.document_id = ?
       ORDER BY c.created_at ASC`,
      [documentId]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return next(error);
  }
});

/** Ajouter un commentaire (accès lecture au document requis). */
router.post("/:id/comments", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      return res.status(400).json({ success: false, message: "Identifiant de document invalide" });
    }
    const raw = req.body.comment ?? req.body.text ?? "";
    const commentText = String(raw).trim();
    if (!commentText) {
      return res.status(400).json({ success: false, message: "Le commentaire est requis" });
    }
    if (commentText.length > MAX_DOCUMENT_COMMENT_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Commentaire trop long (max ${MAX_DOCUMENT_COMMENT_LENGTH} caractères)`,
      });
    }

    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const insert = await query(
      `INSERT INTO document_comments (document_id, user_id, comment) VALUES (?, ?, ?)`,
      [documentId, req.user.id, commentText]
    );
    const newId = insert.rows.insertId;

    await logAudit({
      actorId: req.user.id,
      action: "documents.comments.create",
      entityType: "document_comment",
      entityId: String(newId),
      metadata: {
        documentId,
        documentTitle: ctx.docRow.title,
        length: commentText.length,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    const rows = await query(
      `SELECT c.id, c.document_id, c.user_id, c.comment, c.created_at, c.updated_at,
              u.full_name AS author_name, u.email AS author_email
       FROM document_comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [newId]
    );
    return res.status(201).json({ success: true, data: rows.rows[0] || null });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/public-url", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const result = await mintOfficePreviewUrlsForUser(req.user, documentId);
    if (result.error) return res.status(result.error.status).json(result.error.body);
    return res.json({ success: true, data: result.data });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/office-embed-url", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const result = await mintOfficePreviewUrlsForUser(req.user, documentId);
    if (result.error) return res.status(result.error.status).json(result.error.body);
    const { embedUrl, publicUrl, expiresAt } = result.data;
    return res.json({
      success: true,
      data: { embedUrl, streamUrl: publicUrl, expiresAt },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/duplicate", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const doc = await query("SELECT owner_id FROM documents WHERE id = ?", [documentId]);
    if (doc.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    if (!isAdmin(req.user) && doc.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const created = await duplicateDocument({ documentId, newOwnerId: req.user.id });
    await logAudit({
      actorId: req.user.id,
      action: "documents.duplicate",
      entityType: "document",
      entityId: String(created.id),
      metadata: { sourceId: documentId },
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/permanent", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const result = await deleteDocumentPermanent(documentId);
    if (!result.deleted) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    await logAudit({
      actorId: req.user.id,
      action: "documents.permanent_delete",
      entityType: "document",
      entityId: String(documentId),
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Document supprimé définitivement" });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/preview", authenticate, async (req, res, next) => {
  try {
    const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const abs = path.resolve(ctx.docRow.file_path);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ success: false, message: "Fichier introuvable sur le serveur" });
    }
    res.setHeader("Content-Type", ctx.docRow.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(ctx.docRow.original_name)}`
    );
    return res.sendFile(abs);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    const dto = toDocumentDto(ctx.docRow);
    return res.json({
      success: true,
      data: {
        ...dto,
        access: {
          role: ctx.access.kind,
          permission: ctx.access.permission,
          permissions: {
            view: ctx.access.canView,
            download: ctx.access.canDownload,
            manage: ctx.access.canManageVersion,
          },
          canDownload: ctx.access.canDownload,
          canManageVersion: ctx.access.canManageVersion,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/send-email", authenticate, async (req, res, next) => {
  try {
    const baseId = Number(req.params.id);
    const extras = Array.isArray(req.body.documentIds)
      ? req.body.documentIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const documentIds = Array.from(new Set([baseId, ...extras]));

    const recipients = toRecipientList(req.body.recipients);
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, message: "Au moins un destinataire valide est requis" });
    }

    const mode = req.body.mode === "attachment" ? "attachment" : "link";
    const subject = String(req.body.subject || "Documents partagés");
    const message = String(req.body.message || "");

    const docs = [];
    for (const id of documentIds) {
      const ctx = await getDocumentWithAccess(req.user, id);
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      const need = mode === "attachment" ? "download" : "view";
      if (!assertMinAccess(ctx.access, need)) {
        return res.status(403).json({
          success: false,
          message:
            need === "download"
              ? `Permission de téléchargement requise pour le document ${id}`
              : `Permission de lecture requise pour le document ${id}`,
        });
      }
      docs.push(ctx.docRow);
    }

    const frontendBase = (env.app.frontendUrl || "http://localhost:5173").replace(/\/$/, "");
    const results = [];

    if (mode === "attachment") {
      const total = docs.reduce((s, d) => s + Number(d.size || 0), 0);
      if (total > MAX_EMAIL_ATTACHMENT_BYTES) {
        return res.status(400).json({
          success: false,
          message: `Taille totale trop élevée pour les pièces jointes (max ${MAX_EMAIL_ATTACHMENT_BYTES} octets). Utilisez le mode lien.`,
        });
      }
      const attachments = docs.map((d) => ({
        filename: d.original_name,
        path: d.file_path,
      }));
      await sendEmail({
        to: recipients.join(", "),
        subject,
        text: message || "Veuillez trouver les documents en pièce jointe.",
        html: `<p>${(message || "Veuillez trouver les documents en pièce jointe.").replace(/\n/g, "<br/>")}</p>`,
        attachments,
      });
      results.push(...docs.map((d) => ({ documentId: d.id, mode: "attachment" })));
    } else {
      const links = [];
      for (const d of docs) {
        const token = crypto.randomBytes(32).toString("hex");
        await query(
          `INSERT INTO public_links
           (document_id, token, password_hash, allow_download, expires_at, created_by, revoked)
           VALUES (?, ?, NULL, 1, DATE_ADD(NOW(), INTERVAL 7 DAY), ?, 0)`,
          [d.id, token, req.user.id]
        );
        const publicUrl = `${frontendBase}/public-link/${encodeURIComponent(token)}`;
        links.push({ id: d.id, title: d.title, url: publicUrl });
        results.push({ documentId: d.id, mode: "link", url: publicUrl });
      }

      const lines = links.map((l) => `- ${l.title}: ${l.url}`).join("\n");
      await sendEmail({
        to: recipients.join(", "),
        subject,
        text: `${message}\n\nLiens sécurisés (valides 7 jours):\n${lines}`.trim(),
        html: `<p>${(message || "").replace(/\n/g, "<br/>")}</p><p><strong>Liens sécurisés (valides 7 jours):</strong></p><ul>${links
          .map((l) => `<li>${l.title}: <a href="${l.url}">${l.url}</a></li>`)
          .join("")}</ul>`,
      });
    }

    await logAudit({
      actorId: req.user.id,
      action: "documents.email.send",
      entityType: "document",
      entityId: String(baseId),
      metadata: {
        mode,
        recipientsCount: recipients.length,
        recipients,
        documentIds,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.json({ success: true, message: "Email envoyé", data: { mode, results } });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/upload",
  authenticate,
  uploadFilesMiddleware,
  async (req, res, next) => {
    try {
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ success: false, message: "No files uploaded" });
      }

      const category = req.body.category || "General";
      const description = req.body.description || null;
      const tags = req.body.tags || null;
      const visibilityRaw = String(req.body.visibility || "private").toLowerCase();
      const visibility = visibilityRaw === "public" ? "public" : "private";
      let customValues = {};
      if (req.body.customValues) {
        try {
          const parsed = JSON.parse(String(req.body.customValues));
          customValues = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
          customValues = {};
        }
      }

      for (const file of files) {
        const risk = detectSensitiveInUpload(
          {
            title: req.body.title,
            description,
            tags,
            originalname: file.originalname,
          },
          file.path
        );
        if (risk.isRisky) {
          for (const f of files) {
            try {
              fs.unlinkSync(f.path);
            } catch (_) {
              // ignore
            }
          }
          const kw = risk.matchedKeyword || "";
          return res.status(400).json({
            success: false,
            code: "SENSITIVE_CONTENT",
            matchedKeyword: risk.matchedKeyword,
            message: `Document refusé par IA : contenu sensible détecté (mot-clé: ${kw})`,
          });
        }
      }

      const created = await insertUploadedDocuments({
        files,
        ownerId: req.user.id,
        title: req.body.title,
        category,
        tags,
        description,
        visibility,
        isUploaderAdmin: isAdmin(req.user),
      });
      for (const doc of created) {
        for (const [fieldId, value] of Object.entries(customValues)) {
          if (String(value ?? "").trim() === "") continue;
          await query(
            `INSERT INTO document_custom_values (document_id, field_id, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [doc.id, Number(fieldId), String(value)]
          );
        }
        queueDocumentEmbedding(doc.id);
        if (doc.status === "active") {
          queueTextExtraction({
            documentId: doc.id,
            filePath: doc.file_path,
            mimeType: doc.mime_type,
            originalName: doc.original_name,
          });
        }
      }

      await logAudit({
        actorId: req.user.id,
        action: "documents.upload",
        entityType: "document",
        metadata: { count: files.length },
        ipAddress: req.ip,
      });

      return res.status(201).json({
        success: true,
        data: created,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.put("/:id/approve", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const doc = await query("SELECT * FROM documents WHERE id = ?", [documentId]);
    if (doc.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Document introuvable" });
    }
    const row = doc.rows[0];
    if (row.status !== "pending_approval") {
      return res.status(400).json({
        success: false,
        message: "Ce document n'est pas en attente d'approbation",
      });
    }
    await query("UPDATE documents SET status = 'active', updated_at = NOW() WHERE id = ?", [documentId]);
    const updated = await query(
      `SELECT d.*, u.full_name AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.id = ?`,
      [documentId]
    );
    const dto = toDocumentDto(updated.rows[0]);
    queueTextExtraction({
      documentId: dto.id,
      filePath: dto.file_path,
      mimeType: dto.mime_type,
      originalName: dto.original_name,
    });
    await notifyDocumentOwner({
      documentId,
      ownerId: row.owner_id,
      action: "approve",
      documentTitle: row.title,
    });
    await logAudit({
      actorId: req.user.id,
      action: "documents.approve_pending",
      entityType: "document",
      entityId: String(documentId),
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: dto });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/reject", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const reason = String(req.body?.reason || req.query.reason || "").trim() || null;
    const doc = await query("SELECT id, title, owner_id, status FROM documents WHERE id = ?", [documentId]);
    if (doc.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Document introuvable" });
    }
    const row = doc.rows[0];
    if (row.status !== "pending_approval") {
      return res.status(400).json({
        success: false,
        message: "Ce document n'est pas en attente d'approbation",
      });
    }
    const result = await deleteDocumentPermanent(documentId);
    if (!result.deleted) {
      return res.status(404).json({ success: false, message: "Document introuvable" });
    }
    await notifyDocumentOwner({
      documentId,
      ownerId: row.owner_id,
      action: "reject",
      reason,
      documentTitle: row.title,
    });
    await logAudit({
      actorId: req.user.id,
      action: "documents.reject_pending",
      entityType: "document",
      entityId: String(documentId),
      metadata: { reason },
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Document refusé et supprimé" });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/download", authenticate, async (req, res, next) => {
  try {
    const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "download")) {
      return res.status(403).json({
        success: false,
        message: "Permission de téléchargement requise",
      });
    }
    const abs = path.resolve(ctx.docRow.file_path);
    if (shouldWatermarkPdfDownload(ctx.docRow)) {
      const bytes = await applyPdfWatermarkFromFile(abs, req.user.full_name || req.user.email || "User");
      await logAudit({
        actorId: req.user.id,
        action: "document.watermark.generated",
        entityType: "document",
        entityId: String(req.params.id),
        metadata: { documentId: Number(req.params.id), title: ctx.docRow.title },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(ctx.docRow.original_name)}`
      );
      return res.send(bytes);
    }
    return res.download(abs, ctx.docRow.original_name);
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/archive", authenticate, async (req, res, next) => {
  try {
    const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    const isOwner = String(ctx.docRow.owner_id) === String(req.user.id);
    if (!isAdmin(req.user) && !isOwner) {
      return res.status(403).json({ success: false, message: "Seul le propriétaire peut archiver" });
    }
    await query("UPDATE documents SET status = 'archived' WHERE id = ?", [req.params.id]);
    return res.json({ success: true, message: "Document archived successfully" });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/delete", authenticate, async (req, res, next) => {
  try {
    const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    const isOwner = String(ctx.docRow.owner_id) === String(req.user.id);
    if (!isAdmin(req.user) && !isOwner) {
      return res.status(403).json({ success: false, message: "Seul le propriétaire peut supprimer" });
    }
    await query("UPDATE documents SET status = 'deleted', deleted_at = NOW() WHERE id = ?", [req.params.id]);
    await logAudit({
      actorId: req.user.id,
      action: "documents.soft_delete",
      entityType: "document",
      entityId: String(req.params.id),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.json({ success: true, message: "Document déplacé dans la corbeille" });
  } catch (error) {
    return next(error);
  }
});

router.put("/trash/:id/restore", authenticate, async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const doc = await query("SELECT id, owner_id, status FROM documents WHERE id = ?", [documentId]);
    if (doc.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    const row = doc.rows[0];
    if (row.status !== "deleted") {
      return res.status(400).json({ success: false, message: "Ce document n'est pas dans la corbeille" });
    }
    const isOwner = String(row.owner_id) === String(req.user.id);
    if (!isAdmin(req.user) && !isOwner) {
      return res.status(403).json({ success: false, message: "Seul le propriétaire peut restaurer" });
    }
    await query("UPDATE documents SET status = 'active', deleted_at = NULL, updated_at = NOW() WHERE id = ?", [
      documentId,
    ]);
    await logAudit({
      actorId: req.user.id,
      action: "documents.restore",
      entityType: "document",
      entityId: String(documentId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.json({ success: true, message: "Document restauré" });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/:id/versions",
  authenticate,
  uploadSingleMiddleware,
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: "File is required" });
      }
      const documentId = Number(req.params.id);
      const ctx = await getDocumentWithAccess(req.user, documentId);
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      if (!assertMinAccess(ctx.access, "manage")) {
        return res.status(403).json({
          success: false,
          message: "Permission « manage » requise pour une nouvelle version",
        });
      }

      const maxVersion = await query(
        "SELECT COALESCE(MAX(version_number), 0) AS maxVersion FROM document_versions WHERE document_id = ?",
        [documentId]
      );
      const nextVersion = Number(maxVersion.rows[0].maxVersion) + 1;

      const comment = req.body.comment || null;
      const insert = await query(
        `INSERT INTO document_versions (document_id, version_number, file_path, size, created_by, comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [documentId, nextVersion, file.path, file.size, req.user.id, comment]
      );

      await query("UPDATE documents SET file_path = ?, size = ?, updated_at = NOW() WHERE id = ?", [
        file.path,
        file.size,
        documentId,
      ]);

      await logAudit({
        actorId: req.user.id,
        action: "documents.version.upload",
        entityType: "document",
        entityId: String(documentId),
        metadata: { versionNumber: nextVersion, versionId: insert.rows.insertId },
        ipAddress: req.ip,
      });

      return res.status(201).json({
        success: true,
        data: {
          id: insert.rows.insertId,
          document_id: documentId,
          version_number: nextVersion,
          comment,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/:id/versions", authenticate, async (req, res, next) => {
  try {
    const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const rows = await query(
      `SELECT v.id, v.document_id, v.version_number, v.file_path, v.size, v.created_by, v.comment, v.created_at,
              u.full_name AS created_by_name
       FROM document_versions v
       JOIN users u ON u.id = v.created_by
       WHERE v.document_id = ?
       ORDER BY v.version_number DESC`,
      [req.params.id]
    );
    return res.json({
      success: true,
      data: rows.rows.map((row) => ({
        ...row,
        downloadUrl: `/api/v1/documents/${req.params.id}/versions/${row.id}/download`,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/:id/versions/:versionId/download",
  authenticate,
  async (req, res, next) => {
    try {
      const version = await query(
        `SELECT v.id, v.file_path, d.original_name, d.owner_id
         FROM document_versions v
         JOIN documents d ON d.id = v.document_id
         WHERE v.document_id = ? AND v.id = ?`,
        [req.params.id, req.params.versionId]
      );
      if (version.rowCount === 0) {
        return res.status(404).json({ success: false, message: "Version not found" });
      }
      const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      if (!assertMinAccess(ctx.access, "download")) {
        return res.status(403).json({
          success: false,
          message: "Permission de téléchargement requise",
        });
      }
      return res.download(
        version.rows[0].file_path,
        `v${req.params.versionId}-${version.rows[0].original_name}`
      );
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/:id/versions/:versionId/restore",
  authenticate,
  async (req, res, next) => {
    try {
      const ctx = await getDocumentWithAccess(req.user, Number(req.params.id));
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      if (!assertMinAccess(ctx.access, "manage")) {
        return res.status(403).json({
          success: false,
          message: "Permission « manage » requise pour restaurer une version",
        });
      }
      const version = await query(
        `SELECT id, document_id, file_path, size
         FROM document_versions
         WHERE document_id = ? AND id = ?`,
        [req.params.id, req.params.versionId]
      );
      if (version.rowCount === 0) {
        return res.status(404).json({ success: false, message: "Version not found" });
      }
      await query("UPDATE documents SET file_path = ?, size = ?, updated_at = NOW() WHERE id = ?", [
        version.rows[0].file_path,
        version.rows[0].size,
        req.params.id,
      ]);
      await logAudit({
        actorId: req.user.id,
        action: "documents.version.restore",
        entityType: "document",
        entityId: String(req.params.id),
        metadata: { versionId: req.params.versionId },
        ipAddress: req.ip,
      });
      return res.json({ success: true, message: "Version restored successfully" });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
