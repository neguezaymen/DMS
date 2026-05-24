const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { loadUserAuthContext } = require("../modules/auth/auth.service");
const { isAdmin, isManager } = require("../utils/auth-roles");

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Missing access token" });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.accessSecret);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Auth] JWT invalide ou expiré:", err?.name || err?.message || err);
    return res.status(401).json({ success: false, message: "Invalid access token" });
  }

  const rawSub = payload?.sub;
  const userId = typeof rawSub === "number" && Number.isFinite(rawSub) ? rawSub : Number.parseInt(String(rawSub), 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    // eslint-disable-next-line no-console
    console.error("[Auth] JWT sans sub utilisateur valide:", rawSub);
    return res.status(401).json({ success: false, message: "Invalid access token" });
  }

  try {
    const ctx = await loadUserAuthContext(userId);
    if (!ctx) {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }
    req.user = ctx;

    const debugAuth = process.env.DEBUG_AUTH === "1" || process.env.NODE_ENV !== "production";
    if (debugAuth) {
      // eslint-disable-next-line no-console
      console.log("[Auth] User permissions:", req.user.permissions);
      // eslint-disable-next-line no-console
      console.log("[Auth] User roles:", req.user.roles);
    }

    return next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Auth] Échec chargement utilisateur (base de données):", error?.message || error, error?.stack);
    return res.status(500).json({
      success: false,
      message: "Authentication service unavailable",
    });
  }
};

const authorize = (...requiredPermissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (requiredPermissions.length === 0) {
    return next();
  }
  if (isAdmin(req.user)) {
    return next();
  }
  const userPermissions = new Set(
    (req.user.permissions || []).map((p) => String(p || "").trim()).filter(Boolean)
  );
  const hasPermission = requiredPermissions.every((permission) => userPermissions.has(permission));
  if (!hasPermission) {
    // eslint-disable-next-line no-console
    console.error("[Auth] authorize 403", {
      email: req.user?.email,
      id: req.user?.id,
      required: requiredPermissions,
      have: [...userPermissions],
    });
    const payload = {
      success: false,
      message: "Forbidden",
      required: requiredPermissions,
    };
    if (process.env.NODE_ENV !== "production") {
      payload.have = [...userPermissions];
    }
    return res.status(403).json(payload);
  }
  return next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  const hasAccess = isAdmin(req.user);
  // eslint-disable-next-line no-console
  console.log(
    `[requireAdmin] user=${req.user.email} roleIds=${JSON.stringify(
      req.user.roleIds || []
    )} roles=${JSON.stringify(req.user.roles || [])} access=${hasAccess}`
  );
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  return next();
};

module.exports = { authenticate, authorize, requireAdmin, isAdmin, isManager };
