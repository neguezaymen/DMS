const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../../config/db");
const env = require("../../config/env");

const JWT_PURPOSE = "public_link_access";

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

function linkPublicPaths(token) {
  const base = "/api/v1/public-links";
  return {
    metaUrl: `${base}/${encodeURIComponent(token)}/meta`,
    grantUrl: `${base}/${encodeURIComponent(token)}/grant`,
    previewUrl: `${base}/${encodeURIComponent(token)}/preview`,
    downloadUrl: `${base}/${encodeURIComponent(token)}/download`,
  };
}

function assertLinkUsable(row) {
  if (!row) return { ok: false, status: 404, message: "Lien introuvable" };
  if (row.revoked) return { ok: false, status: 410, message: "Lien désactivé" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, status: 410, message: "Lien expiré" };
  }
  return { ok: true };
}

async function logLinkAccess(linkId, req, action) {
  const ua = req.get("user-agent") || null;
  const ip = req.ip || req.connection?.remoteAddress || null;
  await query(
    `INSERT INTO link_access_logs (link_id, ip_address, user_agent, action)
     VALUES (?, ?, ?, ?)`,
    [linkId, ip, ua, action]
  );
}

function issuePublicLinkJwt(payload) {
  return jwt.sign(
    {
      purpose: JWT_PURPOSE,
      linkId: payload.linkId,
      documentId: payload.documentId,
      token: payload.token,
    },
    env.jwt.accessSecret,
    { expiresIn: "1h" }
  );
}

function verifyPublicLinkJwt(bearerToken, expectedUrlToken) {
  try {
    const decoded = jwt.verify(bearerToken, env.jwt.accessSecret);
    if (decoded.purpose !== JWT_PURPOSE) return null;
    if (decoded.token !== expectedUrlToken) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function loadActiveLinkByUrlToken(urlToken) {
  const r = await query(
    `SELECT pl.*, d.file_path, d.original_name, d.mime_type, d.title
     FROM public_links pl
     JOIN documents d ON d.id = pl.document_id
     WHERE pl.token = ?`,
    [urlToken]
  );
  return r.rows[0] || null;
}

async function comparePassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = {
  JWT_PURPOSE,
  generateOpaqueToken,
  linkPublicPaths,
  assertLinkUsable,
  logLinkAccess,
  issuePublicLinkJwt,
  verifyPublicLinkJwt,
  loadActiveLinkByUrlToken,
  comparePassword,
};
