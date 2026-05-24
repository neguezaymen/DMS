const { query } = require("../../config/db");
const { sendEmail } = require("../../services/mailer");

const NOTIFICATION_TYPES = ["share", "workflow", "expiry", "upload", "system", "document_approval"];

function validType(type) {
  return NOTIFICATION_TYPES.includes(type);
}

async function getPreference(userId, type) {
  const pref = await query(
    `SELECT email_enabled, in_app_enabled
     FROM notification_preferences
     WHERE user_id = ? AND type = ?`,
    [userId, type]
  );
  if (pref.rows.length > 0) {
    return {
      emailEnabled: Boolean(pref.rows[0].email_enabled),
      inAppEnabled: Boolean(pref.rows[0].in_app_enabled),
    };
  }
  return { emailEnabled: true, inAppEnabled: true };
}

async function createNotification({ userId, type, title, message, link = null }) {
  if (!userId || !validType(type)) return;
  const pref = await getPreference(userId, type);

  if (pref.inAppEnabled) {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, link, is_read)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, type, title, message, link]
    );
  }

  if (pref.emailEnabled) {
    const u = await query("SELECT email FROM users WHERE id = ? AND is_active = 1", [userId]);
    const email = u.rows[0]?.email;
    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: title,
          text: `${message}${link ? `\n\nLien: ${link}` : ""}`,
          html: `<p>${String(message || "").replace(/\n/g, "<br/>")}</p>${
            link ? `<p><a href="${link}">${link}</a></p>` : ""
          }`,
        });
      } catch {
        // SMTP optional in dev
      }
    }
  }
}

async function notifyRoleUsers({ roleId, type, title, message, link = null }) {
  if (!roleId) return;
  const users = await query("SELECT user_id FROM user_roles WHERE role_id = ?", [roleId]);
  for (const row of users.rows) {
    await createNotification({ userId: row.user_id, type, title, message, link });
  }
}

async function notifyDocumentOwner({
  documentId,
  ownerId,
  action,
  reason = null,
  documentTitle = null,
}) {
  if (!documentId || !ownerId || !["approve", "reject"].includes(action)) return;

  let titleValue = documentTitle;
  if (!titleValue) {
    const row = await query(
      `SELECT d.title
       FROM documents d
       WHERE d.id = ? AND d.owner_id = ?
       LIMIT 1`,
      [documentId, ownerId]
    );
    titleValue = titleValue || row.rows[0]?.title;
  }

  const safeTitle = titleValue || "Sans titre";
  const title = action === "approve" ? "Votre document a été approuvé" : "Votre document a été rejeté";
  const message =
    action === "approve"
      ? `Le document « ${safeTitle} » est maintenant accessible.`
      : `Le document « ${safeTitle} » a été rejeté. Motif : ${reason || "non conforme"}.`;
  const link = `/documents/${documentId}`;

  await createNotification({
    userId: ownerId,
    type: "document_approval",
    title,
    message,
    link,
  });
}

async function runExpiryNotifications() {
  const expiringLinks = await query(
    `SELECT pl.id, pl.document_id, pl.created_by, pl.expires_at, d.title
     FROM public_links pl
     JOIN documents d ON d.id = pl.document_id
     WHERE pl.revoked = 0
       AND pl.expires_at IS NOT NULL
       AND pl.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 DAY)`
  );
  for (const row of expiringLinks.rows) {
    const already = await query(
      `SELECT id
       FROM notifications
       WHERE user_id = ?
         AND type = 'expiry'
         AND link = ?
         AND DATE(created_at) = CURDATE()
       LIMIT 1`,
      [row.created_by, `/documents/${row.document_id}`]
    );
    if (already.rows.length > 0) continue;

    await createNotification({
      userId: row.created_by,
      type: "expiry",
      title: "Lien externe bientôt expiré",
      message: `Le lien externe du document « ${row.title} » expire le ${new Date(
        row.expires_at
      ).toLocaleString("fr-FR")}.`,
      link: `/documents/${row.document_id}`,
    });
  }
}

async function purgeOldNotifications({ days = 90 } = {}) {
  const safeDays = Math.max(7, Number(days) || 90);
  const result = await query(
    `DELETE FROM notifications
     WHERE is_read = 1
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [safeDays]
  );
  return Number(result.rows?.affectedRows || 0);
}

module.exports = {
  NOTIFICATION_TYPES,
  validType,
  createNotification,
  notifyRoleUsers,
  notifyDocumentOwner,
  runExpiryNotifications,
  purgeOldNotifications,
};
