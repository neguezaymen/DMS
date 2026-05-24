const express = require("express");
const path = require("path");
const {
  assertLinkUsable,
  logLinkAccess,
  issuePublicLinkJwt,
  verifyPublicLinkJwt,
  loadActiveLinkByUrlToken,
  comparePassword,
} = require("./public-links.service");

const router = express.Router();

function bearer(req) {
  const h = req.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

router.get("/:token/meta", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const row = await loadActiveLinkByUrlToken(urlToken);
    const check = assertLinkUsable(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }
    return res.json({
      success: true,
      data: {
        title: row.title,
        original_name: row.original_name,
        mime_type: row.mime_type,
        allow_download: Boolean(row.allow_download),
        requires_password: Boolean(row.password_hash),
        expires_at: row.expires_at,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/:token/grant", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const row = await loadActiveLinkByUrlToken(urlToken);
    const check = assertLinkUsable(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    const password = req.body?.password != null ? String(req.body.password) : "";

    if (row.password_hash) {
      const ok = await comparePassword(password, row.password_hash);
      if (!ok) {
        return res.status(401).json({ success: false, message: "Mot de passe incorrect" });
      }
    }

    const accessToken = issuePublicLinkJwt({
      linkId: row.id,
      documentId: row.document_id,
      token: urlToken,
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: 3600,
        allow_download: Boolean(row.allow_download),
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.get("/:token/preview", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const token = bearer(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Jeton d’accès requis (Authorization: Bearer)" });
    }
    const decoded = verifyPublicLinkJwt(token, urlToken);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Jeton invalide ou expiré" });
    }

    const row = await loadActiveLinkByUrlToken(urlToken);
    const check = assertLinkUsable(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }
    if (Number(decoded.linkId) !== Number(row.id)) {
      return res.status(403).json({ success: false, message: "Jeton incompatible avec ce lien" });
    }

    await logLinkAccess(row.id, req, "view");

    const abs = path.resolve(row.file_path);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`
    );
    return res.sendFile(abs, (err) => {
      if (err) next(err);
    });
  } catch (e) {
    return next(e);
  }
});

router.get("/:token/download", async (req, res, next) => {
  try {
    const urlToken = req.params.token;
    const token = bearer(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Jeton d’accès requis (Authorization: Bearer)" });
    }
    const decoded = verifyPublicLinkJwt(token, urlToken);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Jeton invalide ou expiré" });
    }

    const row = await loadActiveLinkByUrlToken(urlToken);
    const check = assertLinkUsable(row);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }
    if (Number(decoded.linkId) !== Number(row.id)) {
      return res.status(403).json({ success: false, message: "Jeton incompatible avec ce lien" });
    }

    if (!row.allow_download) {
      return res.status(403).json({
        success: false,
        message: "Le téléchargement n’est pas autorisé pour ce lien (aperçu uniquement)",
      });
    }

    await logLinkAccess(row.id, req, "download");

    return res.download(row.file_path, row.original_name, (err) => {
      if (err) next(err);
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
