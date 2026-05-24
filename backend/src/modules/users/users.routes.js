const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const env = require("../../config/env");
const { authenticate, authorize } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const { NOTIFICATION_TYPES } = require("../notifications/notifications.service");
const { toJsonSafeDeep } = require("../../utils/jsonSafe");

const router = express.Router();

const avatarDir = path.resolve(__dirname, "../../../uploads/avatars");
fs.mkdirSync(avatarDir, { recursive: true });
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safe = ext === ".png" || ext === ".jpg" || ext === ".jpeg" ? ext : ".jpg";
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${safe}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.originalname?.match(/\.(jpe?g|png)$/i);
    if (ok) cb(null, true);
    else cb(new Error("Format accepté : JPG ou PNG uniquement"));
  },
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const uid = Number(req.user.id);
    let user;
    try {
      user = await query(
        `SELECT id, full_name, email, last_login_at,
                COALESCE(locale, 'fr') AS locale,
                COALESCE(theme_pref, 'light') AS theme_pref,
                avatar_path
         FROM users WHERE id = ?`,
        [uid]
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[users/me] user select (colonnes locale/theme/avatar manquantes ?)", e?.message || e);
      user = await query(
        `SELECT id, full_name, email, last_login_at FROM users WHERE id = ?`,
        [uid]
      );
      if (user.rows[0]) {
        user.rows[0].locale = "fr";
        user.rows[0].theme_pref = "light";
        user.rows[0].avatar_path = user.rows[0].avatar_path ?? null;
      }
    }
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    const settled = await Promise.allSettled([
      query(
        `SELECT d.id, d.name FROM departments d
         INNER JOIN user_departments ud ON ud.department_id = d.id
         WHERE ud.user_id = ?
         ORDER BY d.name`,
        [uid]
      ),
      query(
        `SELECT GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',') AS names
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        [uid]
      ),
      query(
        `SELECT COUNT(*) AS c FROM documents
         WHERE owner_id = ? AND deleted_at IS NULL`,
        [uid]
      ).catch(() => query(`SELECT COUNT(*) AS c FROM documents WHERE owner_id = ?`, [uid])),
      query(
        `SELECT COUNT(*) AS c FROM workflow_actions
         WHERE actor_id = ? AND action = 'approve'`,
        [uid]
      ).catch(() => ({ rows: [{ c: 0 }], rowCount: 1 })),
    ]);

    const depts =
      settled[0].status === "fulfilled" ? settled[0].value : { rows: [] };
    if (settled[0].status === "rejected") {
      // eslint-disable-next-line no-console
      console.error("[users/me] departments:", settled[0].reason?.message || settled[0].reason);
    }

    const rolesRow =
      settled[1].status === "fulfilled" ? settled[1].value : { rows: [{ names: null }] };
    if (settled[1].status === "rejected") {
      // eslint-disable-next-line no-console
      console.error("[users/me] roles:", settled[1].reason?.message || settled[1].reason);
    }

    let docCount = { rows: [{ c: 0 }] };
    if (settled[2].status === "fulfilled") {
      docCount = settled[2].value;
    } else {
      // eslint-disable-next-line no-console
      console.error("[users/me] docCount:", settled[2].reason?.message || settled[2].reason);
    }

    let wfCount = { rows: [{ c: 0 }] };
    if (settled[3].status === "fulfilled") {
      wfCount = settled[3].value;
    } else {
      // eslint-disable-next-line no-console
      console.error("[users/me] wfCount:", settled[3].reason?.message || settled[3].reason);
    }

    const roleNames = rolesRow.rows[0]?.names ? rolesRow.rows[0].names.split(",") : [];
    const base =
      (env.app.publicApiUrl || `http://localhost:${env.port || 3000}`).replace(/\/$/, "") ||
      "";
    const row = user.rows[0];
    const avatarUrl =
      row.avatar_path && base ? `${base}/uploads/${row.avatar_path}` : null;
    const payload = {
      success: true,
      data: {
        ...row,
        avatar_url: avatarUrl,
        departments: depts.rows,
        roles: roleNames,
        stats: {
          documents_uploaded: Number(docCount.rows[0]?.c || 0),
          workflows_approved: Number(wfCount.rows[0]?.c || 0),
        },
      },
    };
    return res.json(toJsonSafeDeep(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[users/me]", error?.message || error, error?.stack);
    return next(error);
  }
});

router.put("/profile", authenticate, async (req, res, next) => {
  try {
    const {
      fullName,
      departmentId,
      departmentIds,
      locale,
      theme,
      notificationsEmailEnabled,
      notificationsInAppEnabled,
    } = req.body;

    if (fullName !== undefined) {
      const trimmed = String(fullName || "").trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "Le nom complet est requis" });
      }
      await query("UPDATE users SET full_name = ? WHERE id = ?", [trimmed, req.user.id]);
    }

    if (locale !== undefined) {
      const loc = String(locale).toLowerCase();
      if (!["fr", "en"].includes(loc)) {
        return res.status(400).json({ success: false, message: "Langue invalide" });
      }
      await query("UPDATE users SET locale = ? WHERE id = ?", [loc, req.user.id]);
    }

    if (theme !== undefined) {
      const th = String(theme).toLowerCase();
      if (!["light", "dark"].includes(th)) {
        return res.status(400).json({ success: false, message: "Thème invalide" });
      }
      await query("UPDATE users SET theme_pref = ? WHERE id = ?", [th, req.user.id]);
    }

    if (Array.isArray(departmentIds)) {
      const ids = departmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
      await query("DELETE FROM user_departments WHERE user_id = ?", [req.user.id]);
      for (const id of ids) {
        const exists = await query("SELECT id FROM departments WHERE id = ?", [id]);
        if (exists.rows.length > 0) {
          await query("INSERT IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)", [
            req.user.id,
            id,
          ]);
        }
      }
    } else if (departmentId !== undefined && departmentId !== null) {
      const did = Number(departmentId);
      if (!Number.isFinite(did)) {
        return res.status(400).json({ success: false, message: "Département invalide" });
      }
      const exists = await query("SELECT id FROM departments WHERE id = ?", [did]);
      if (exists.rows.length === 0) {
        return res.status(400).json({ success: false, message: "Département introuvable" });
      }
      await query("DELETE FROM user_departments WHERE user_id = ?", [req.user.id]);
      await query("INSERT IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)", [
        req.user.id,
        did,
      ]);
    } else if (departmentId === null) {
      await query("DELETE FROM user_departments WHERE user_id = ?", [req.user.id]);
    }

    if (
      notificationsEmailEnabled !== undefined ||
      notificationsInAppEnabled !== undefined
    ) {
      const emailOn = notificationsEmailEnabled !== false;
      const inAppOn = notificationsInAppEnabled !== false;
      for (const type of NOTIFICATION_TYPES) {
        await query(
          `INSERT INTO notification_preferences (user_id, type, email_enabled, in_app_enabled)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             email_enabled = VALUES(email_enabled),
             in_app_enabled = VALUES(in_app_enabled)`,
          [req.user.id, type, emailOn ? 1 : 0, inAppOn ? 1 : 0]
        );
      }
    }

    await logAudit({
      actorId: req.user.id,
      action: "users.profile_update",
      entityType: "user",
      entityId: String(req.user.id),
      metadata: {
        fullName: fullName !== undefined,
        departmentId: departmentId !== undefined,
        locale: locale !== undefined,
        theme: theme !== undefined,
        departmentIds: departmentIds !== undefined,
        notifications: notificationsEmailEnabled !== undefined || notificationsInAppEnabled !== undefined,
      },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: "Profil mis à jour" });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/avatar",
  authenticate,
  (req, res, next) => {
    avatarUpload.single("avatar")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || "Upload invalide" });
      }
      return next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Fichier manquant" });
      }
      const rel = `avatars/${path.basename(req.file.path)}`;
      const prev = await query("SELECT avatar_path FROM users WHERE id = ?", [req.user.id]);
      const old = prev.rows[0]?.avatar_path;
      if (old && String(old).startsWith("avatars/")) {
        const oldAbs = path.resolve(__dirname, "../../../uploads", old);
        try {
          fs.unlinkSync(oldAbs);
        } catch (_) {
          // ignore
        }
      }
      await query("UPDATE users SET avatar_path = ? WHERE id = ?", [rel, req.user.id]);
      const base = (env.app.publicApiUrl || `http://localhost:${env.port || 3000}`).replace(
        /\/$/,
        ""
      );
      const avatarUrl = `${base}/uploads/${rel}`;
      await logAudit({
        actorId: req.user.id,
        action: "users.avatar_update",
        entityType: "user",
        entityId: String(req.user.id),
        ipAddress: req.ip,
      });
      return res.json({ success: true, data: { avatar_path: rel, avatar_url: avatarUrl } });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete("/avatar", authenticate, async (req, res, next) => {
  try {
    const current = await query("SELECT avatar_path FROM users WHERE id = ?", [req.user.id]);
    const old = current.rows[0]?.avatar_path;
    if (old && String(old).startsWith("avatars/")) {
      const oldAbs = path.resolve(__dirname, "../../../uploads", old);
      try {
        fs.unlinkSync(oldAbs);
      } catch (_) {
        // Fichier déjà absent : la suppression en base reste la source de vérité.
      }
    }
    await query("UPDATE users SET avatar_path = NULL WHERE id = ?", [req.user.id]);
    await logAudit({
      actorId: req.user.id,
      action: "users.avatar_delete",
      entityType: "user",
      entityId: String(req.user.id),
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { avatar_path: null, avatar_url: null } });
  } catch (error) {
    return next(error);
  }
});

router.put("/change-password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Mot de passe actuel et nouveau mot de passe requis",
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "La confirmation ne correspond pas au nouveau mot de passe",
      });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({
        success: false,
        message: "Le nouveau mot de passe doit contenir au moins 8 caractères",
      });
    }
    const row = await query(
      "SELECT password_hash FROM users WHERE id = ? AND is_active = 1",
      [req.user.id]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }
    const ok = await bcrypt.compare(currentPassword, row.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Mot de passe actuel incorrect" });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.user.id]);
    await logAudit({
      actorId: req.user.id,
      action: "users.password_change",
      entityType: "user",
      entityId: String(req.user.id),
      metadata: {},
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Mot de passe mis à jour" });
  } catch (error) {
    return next(error);
  }
});

router.put("/me", authenticate, async (req, res, next) => {
  try {
    const { fullName, departmentIds } = req.body;
    if (fullName) {
      await query("UPDATE users SET full_name = ? WHERE id = ?", [
        String(fullName).trim(),
        req.user.id,
      ]);
    }
    if (Array.isArray(departmentIds)) {
      await query("DELETE FROM user_departments WHERE user_id = ?", [req.user.id]);
      for (const did of departmentIds) {
        await query(
          "INSERT IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)",
          [req.user.id, Number(did)]
        );
      }
    }
    await logAudit({
      actorId: req.user.id,
      action: "users.profile_update",
      entityType: "user",
      entityId: String(req.user.id),
      metadata: { fullName: Boolean(fullName), departmentIds },
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Profil mis à jour" });
  } catch (error) {
    return next(error);
  }
});

router.get("/", authenticate, authorize("users:read"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at,
              GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',') as roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    const normalized = result.rows.map((row) => ({
      ...row,
      roles: row.roles ? row.roles.split(",") : [],
    }));
    return res.json({ success: true, data: normalized });
  } catch (error) {
    return next(error);
  }
});

router.post("/", authenticate, authorize("users:create"), async (req, res, next) => {
  try {
    const { fullName, email, password, roleName } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES (?, ?, ?)`,
      [fullName, email.toLowerCase(), passwordHash]
    );
    const createdUser = await query(
      `SELECT id, full_name, email, is_active, created_at
       FROM users
       WHERE email = ?`,
      [email.toLowerCase()]
    );
    const role = await query("SELECT id FROM roles WHERE name = ?", [roleName || "user"]);
    if (role.rowCount > 0) {
      await query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [
        createdUser.rows[0].id,
        role.rows[0].id,
      ]);
    }
    await logAudit({
      actorId: req.user.id,
      action: "users.create",
      entityType: "user",
      entityId: createdUser.rows[0].id,
      metadata: { email: createdUser.rows[0].email, roleName },
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: createdUser.rows[0] });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
