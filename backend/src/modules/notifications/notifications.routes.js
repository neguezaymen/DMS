const express = require("express");
const { authenticate } = require("../../middlewares/auth");
/** `query` encapsule `pool.query` (pas `execute`) — LIMIT en littéraux sûrs. Voir `src/config/db.js`. */
const { query } = require("../../config/db");
const { NOTIFICATION_TYPES, validType } = require("./notifications.service");

const router = express.Router();

/** Entiers bornés pour `LIMIT offset, limit`. */
function notificationsPaging(page, limit) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 30)));
  const offset = (p - 1) * lim;
  return { page: p, limit: lim, offset: Math.max(0, offset) };
}

/** Authentification obligatoire sur toutes les routes notifications (évite 401 silencieux si le routeur parent change). */
router.use(authenticate);

router.get("/unread/count", async (req, res, next) => {
  try {
    const row = await query(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0",
      [req.user.id]
    );
    return res.json({ success: true, data: { unread: Number(row.rows[0]?.total || 0) } });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [GET /api/v1/notifications/unread/count]", e?.message || e);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", e?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", e?.sqlState, e?.code);
    return next(e);
  }
});

router.get("/preferences", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT type, email_enabled, in_app_enabled
       FROM notification_preferences
       WHERE user_id = ?`,
      [req.user.id]
    );
    const map = {};
    for (const t of NOTIFICATION_TYPES) {
      map[t] = { email_enabled: true, in_app_enabled: true };
    }
    for (const r of rows.rows || []) {
      map[r.type] = {
        email_enabled: Boolean(r.email_enabled),
        in_app_enabled: Boolean(r.in_app_enabled),
      };
    }
    return res.json({ success: true, data: map });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [GET /api/v1/notifications/preferences]", e?.message || e);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", e?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", e?.sqlState, e?.code);
    return next(e);
  }
});

router.get("/", async (req, res, next) => {
  const { page, limit, offset } = notificationsPaging(req.query.page, req.query.limit);
  try {
    const rows = await query(
      `SELECT id, user_id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${offset}, ${limit}`,
      [req.user.id]
    );
    const count = await query("SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?", [req.user.id]);
    const dataRows = Array.isArray(rows.rows) ? rows.rows : [];
    return res.json({
      success: true,
      data: dataRows,
      page,
      limit,
      total: Number(count.rows?.[0]?.total || 0),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [GET /api/v1/notifications]", e?.message || e);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", e?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", e?.sqlState, e?.code);
    // eslint-disable-next-line no-console
    console.error("[ERROR] context:", { userId: req.user?.id, page, limit, offset });
    return next(e);
  }
});

router.put("/:id/read", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const own = await query("SELECT id FROM notifications WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!own.rows.length) return res.status(404).json({ success: false, message: "Notification introuvable" });
    await query("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
    return res.json({ success: true, message: "Notification marquée comme lue" });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [PUT /api/v1/notifications/:id/read]", e?.message || e);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", e?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", e?.sqlState, e?.code);
    return next(e);
  }
});

router.put("/preferences", async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.preferences) ? req.body.preferences : [];
    for (const item of items) {
      if (!validType(item.type)) continue;
      await query(
        `INSERT INTO notification_preferences (user_id, type, email_enabled, in_app_enabled)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email_enabled = VALUES(email_enabled),
           in_app_enabled = VALUES(in_app_enabled)`,
        [req.user.id, item.type, item.emailEnabled !== false ? 1 : 0, item.inAppEnabled !== false ? 1 : 0]
      );
    }
    return res.json({ success: true, message: "Préférences enregistrées" });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ERROR] [PUT /api/v1/notifications/preferences]", e?.message || e);
    // eslint-disable-next-line no-console
    console.error("[ERROR] stack:", e?.stack);
    // eslint-disable-next-line no-console
    console.error("[ERROR] sqlState/code:", e?.sqlState, e?.code);
    return next(e);
  }
});

module.exports = router;
