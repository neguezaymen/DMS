const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { query } = require("../../config/db");
const { isAdmin } = require("../../middlewares/auth");
const env = require("../../config/env");

const JWT_PURPOSE = "upload_request_session";

const DEFAULT_ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
];

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isManager(user) {
  const roles = user?.roles || [];
  return roles.some((r) => typeof r === "string" && /^manager$/i.test(r.trim()));
}

async function loadDocument(documentId) {
  if (documentId == null) return null;
  const r = await query("SELECT * FROM documents WHERE id = ?", [documentId]);
  return r.rows[0] || null;
}

function assertRequestRowActive(row) {
  if (!row) return { ok: false, status: 404, message: "Demande introuvable" };
  if (row.status === "revoked") return { ok: false, status: 410, message: "Lien désactivé" };
  if (row.status === "expired") return { ok: false, status: 410, message: "Lien expiré" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, status: 410, message: "Lien expiré" };
  }
  return { ok: true };
}

async function markExpiredIfNeeded(row) {
  if (!row || row.status !== "active") return row;
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    await query("UPDATE upload_requests SET status = 'expired' WHERE id = ?", [row.id]);
    return { ...row, status: "expired" };
  }
  return row;
}

async function canCreateUploadRequest(user, targetDocumentId) {
  if (isAdmin(user)) return true;
  if (isManager(user)) return true;
  if (targetDocumentId != null) {
    const doc = await loadDocument(Number(targetDocumentId));
    if (!doc) return false;
    return String(doc.owner_id) === String(user.id);
  }
  return false;
}

async function canReviewUploadRequest(user, requestRow) {
  if (isAdmin(user)) return true;
  if (isManager(user)) return true;
  if (String(requestRow.created_by) === String(user.id)) return true;
  if (requestRow.target_document_id != null) {
    const doc = await loadDocument(Number(requestRow.target_document_id));
    if (doc && String(doc.owner_id) === String(user.id)) return true;
  }
  return false;
}

function normalizeAllowedMimes(jsonVal) {
  if (jsonVal == null) return DEFAULT_ALLOWED_MIMES;
  let arr = jsonVal;
  if (typeof jsonVal === "string") {
    try {
      arr = JSON.parse(jsonVal);
    } catch {
      return DEFAULT_ALLOWED_MIMES;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_ALLOWED_MIMES;
  return arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

function mimeAllowed(mime, allowedList) {
  const m = (mime || "").toLowerCase();
  for (const raw of allowedList) {
    const a = String(raw).toLowerCase();
    if (a === m) return true;
    if (a.endsWith("/*")) {
      const prefix = a.slice(0, -2);
      if (m.startsWith(`${prefix}/`)) return true;
    }
  }
  return false;
}

function issueUploadSessionJwt(payload) {
  return jwt.sign(
    {
      purpose: JWT_PURPOSE,
      requestId: payload.requestId,
      token: payload.token,
    },
    env.jwt.accessSecret,
    { expiresIn: "2h" }
  );
}

function verifyUploadSessionJwt(bearerToken, urlToken) {
  try {
    const decoded = jwt.verify(bearerToken, env.jwt.accessSecret);
    if (decoded.purpose !== JWT_PURPOSE) return null;
    if (decoded.token !== urlToken) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function loadRequestByToken(token) {
  const r = await query(`SELECT * FROM upload_requests WHERE token = ?`, [token]);
  let row = r.rows[0] || null;
  if (row) row = await markExpiredIfNeeded(row);
  return row;
}

/** Fichiers encore « ouverts » pour la limite max_files (hors approuvé/rejeté définitif). */
async function countOpenSlotsUsed(requestId) {
  const r = await query(
    `SELECT COUNT(*) AS c FROM upload_request_files
     WHERE request_id = ? AND status IN ('pending', 'correction_requested')`,
    [requestId]
  );
  return Number(r.rows[0]?.c || 0);
}

module.exports = {
  JWT_PURPOSE,
  DEFAULT_ALLOWED_MIMES,
  generateOpaqueToken,
  isManager,
  loadDocument,
  assertRequestRowActive,
  markExpiredIfNeeded,
  canCreateUploadRequest,
  canReviewUploadRequest,
  normalizeAllowedMimes,
  mimeAllowed,
  issueUploadSessionJwt,
  verifyUploadSessionJwt,
  loadRequestByToken,
  countOpenSlotsUsed,
};
