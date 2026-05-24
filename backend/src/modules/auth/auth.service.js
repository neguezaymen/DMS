const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../../config/env");
const { query } = require("../../config/db");
const { sendEmail } = require("../../services/mailer");

/**
 * Jeton d'accès : uniquement { sub: userId }. Aucune permission dans le JWT :
 * elles sont relues en base à chaque requête (voir loadUserAuthContext + middleware authenticate).
 */
const createAccessToken = (userId) =>
  jwt.sign({ sub: userId }, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpiresIn });

const createRefreshToken = (userId) =>
  jwt.sign({ sub: userId }, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });

const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");
const generate2faCode = () => String(Math.floor(100000 + Math.random() * 900000));
const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCK_MINUTES = 15;

async function register({ fullName, email, password, confirmPassword }) {
  if (password !== confirmPassword) {
    throw Object.assign(new Error("Password confirmation does not match"), { statusCode: 400 });
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing.rowCount > 0) {
    throw Object.assign(new Error("Email already registered"), { statusCode: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    "INSERT INTO users (full_name, email, password_hash, is_active) VALUES (?, ?, ?, 1)",
    [fullName, normalizedEmail, passwordHash]
  );

  const createdUser = await query(
    "SELECT id, full_name, email, is_active FROM users WHERE email = ?",
    [normalizedEmail]
  );
  const user = createdUser.rows[0];

  const userRole = await query("SELECT id FROM roles WHERE name = ?", ["user"]);
  if (userRole.rowCount > 0) {
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [user.id, userRole.rows[0].id]
    );
  }

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Welcome to DMS Pro",
      text: `Hello ${fullName}, your account is active and ready to use.`,
      html: `<p>Hello <strong>${fullName}</strong>,</p><p>Your DMS Pro account is active and ready to use.</p>`,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Welcome email failed:", error.message);
  }

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    status: user.is_active ? "active" : "pending",
  };
}

async function increaseFailedAttempt(email, ipAddress = null) {
  await query(
    `INSERT INTO login_attempts (email, attempt_count, locked_until, last_ip, last_attempt_at)
     VALUES (?, 1, NULL, ?, NOW())
     ON DUPLICATE KEY UPDATE
       attempt_count = attempt_count + 1,
       last_ip = VALUES(last_ip),
       last_attempt_at = NOW(),
       locked_until = IF(attempt_count + 1 >= ?, DATE_ADD(NOW(), INTERVAL ${LOGIN_LOCK_MINUTES} MINUTE), locked_until)`,
    [email, ipAddress, MAX_FAILED_LOGIN_ATTEMPTS]
  );
  await query(
    `UPDATE users
     SET is_locked = 1,
         lock_expires_at = DATE_ADD(NOW(), INTERVAL ${LOGIN_LOCK_MINUTES} MINUTE)
     WHERE email = ?
       AND EXISTS (
         SELECT 1 FROM login_attempts
         WHERE email = ?
           AND attempt_count >= ?
           AND (locked_until IS NULL OR locked_until > NOW())
       )`,
    [email, email, MAX_FAILED_LOGIN_ATTEMPTS]
  );
}

async function resetAttempts(email) {
  await query(
    `INSERT INTO login_attempts (email, attempt_count, locked_until, last_attempt_at)
     VALUES (?, 0, NULL, NOW())
     ON DUPLICATE KEY UPDATE
       attempt_count = 0,
       locked_until = NULL,
       last_attempt_at = NOW()`,
    [email]
  );
  await query("UPDATE users SET is_locked = 0, lock_expires_at = NULL WHERE email = ?", [email]);
}

async function login({ email, password, ipAddress = null }) {
  const normalizedEmail = email.toLowerCase();
  const attempts = await query(
    "SELECT attempt_count, locked_until FROM login_attempts WHERE email = ?",
    [normalizedEmail]
  );
  if (attempts?.rowCount > 0 && attempts.rows?.[0]?.locked_until) {
    const lockedUntil = new Date(attempts.rows[0].locked_until);
    if (lockedUntil.getTime() > Date.now()) {
      throw Object.assign(
        new Error(`Account locked due to too many failed attempts. Try again in ${LOGIN_LOCK_MINUTES} minutes.`),
        { statusCode: 423 }
      );
    }
  }

  const userResult = await query(
    "SELECT id, email, password_hash, full_name, is_active, is_locked, lock_expires_at FROM users WHERE email = ?",
    [normalizedEmail]
  );
  if (userResult.rowCount === 0) {
    await increaseFailedAttempt(normalizedEmail, ipAddress);
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  const user = userResult.rows[0];
  if (!user.is_active) {
    throw Object.assign(new Error("Account is deactivated"), { statusCode: 403 });
  }
  if (user.is_locked && user.lock_expires_at && new Date(user.lock_expires_at).getTime() > Date.now()) {
    throw Object.assign(new Error("Account is locked. Please try again later or contact admin."), {
      statusCode: 423,
    });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    await increaseFailedAttempt(normalizedEmail, ipAddress);
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  await resetAttempts(normalizedEmail);

  const roleRows = await query(
    `SELECT r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?`,
    [user.id]
  );
  const userRoles = (roleRows.rows || []).map((row) => String(row.name || "").toLowerCase());
  const isAdmin = userRoles.includes("admin");

  if (isAdmin) {
    await query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    const accessToken = createAccessToken(user.id);
    const refreshToken = createRefreshToken(user.id);
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [user.id, hashToken(refreshToken)]
    );
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
    };
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const code = generate2faCode();
  await query(
    `INSERT INTO user_2fa_codes (user_id, code, session_token, expires_at, used)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0)`,
    [user.id, code, sessionToken]
  );
  try {
    await sendEmail({
      to: user.email,
      subject: "Your DMS Pro verification code",
      text: `Your verification code is ${code}. It expires in 5 minutes.`,
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes.</p>`,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("2FA email failed:", error.message);
  }

  return {
    twoFactorRequired: true,
    twoFactorSessionToken: sessionToken,
    message: "2FA code sent to your email.",
  };
}

async function forgotPassword({ email }) {
  const normalizedEmail = email.toLowerCase();
  const userResult = await query("SELECT id, full_name, email FROM users WHERE email = ?", [
    normalizedEmail,
  ]);
  if (userResult.rowCount === 0) {
    return { message: "If this email exists, a reset link has been sent." };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  await query(
    `INSERT INTO password_resets (user_id, email, token_hash, expires_at, used_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
    [userResult.rows[0].id, normalizedEmail, tokenHash]
  );

  const link = `${env.app.resetPasswordUrl}?token=${rawToken}&email=${encodeURIComponent(
    normalizedEmail
  )}`;
  const name = userResult.rows[0].full_name;
  await sendEmail({
    to: normalizedEmail,
    subject: "Reset your DMS Pro password",
    text: `Hi ${name}, reset your password using this link: ${link}. It expires in 1 hour.`,
    html: `<p>Hi <strong>${name}</strong>,</p><p>Reset your password using this <a href="${link}">secure link</a>. It expires in 1 hour.</p>`,
  });

  return { message: "If this email exists, a reset link has been sent." };
}

async function resetPassword({ email, token, password, confirmPassword }) {
  if (password !== confirmPassword) {
    throw Object.assign(new Error("Password confirmation does not match"), { statusCode: 400 });
  }

  const normalizedEmail = email.toLowerCase();
  const tokenHash = hashToken(token);
  const resetEntry = await query(
    `SELECT id
     FROM password_resets
     WHERE email = ?
       AND token_hash = ?
       AND expires_at > NOW()
       AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail, tokenHash]
  );

  if (resetEntry.rowCount === 0) {
    throw Object.assign(new Error("Invalid or expired reset token"), { statusCode: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query("UPDATE users SET password_hash = ? WHERE email = ?", [passwordHash, normalizedEmail]);
  await query("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [resetEntry.rows[0].id]);
  await resetAttempts(normalizedEmail);
  await sendEmail({
    to: normalizedEmail,
    subject: "Your DMS Pro password was changed",
    text: "Your password has been successfully updated. If this was not you, contact support immediately.",
    html: "<p>Your password has been successfully updated.</p><p>If this was not you, contact support immediately.</p>",
  });

  return { message: "Password updated successfully." };
}

async function verify2fa({ twoFactorSessionToken, code }) {
  const entry = await query(
    `SELECT c.id, c.user_id, u.email, u.full_name
     FROM user_2fa_codes c
     JOIN users u ON u.id = c.user_id
     WHERE c.session_token = ?
       AND c.code = ?
       AND c.used = 0
       AND c.expires_at > NOW()
     ORDER BY c.id DESC
     LIMIT 1`,
    [twoFactorSessionToken, code]
  );

  if (entry.rowCount === 0) {
    throw Object.assign(new Error("Invalid or expired 2FA code"), { statusCode: 401 });
  }

  await query("UPDATE user_2fa_codes SET used = 1 WHERE id = ?", [entry.rows[0].id]);
  await query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [entry.rows[0].user_id]);

  const accessToken = createAccessToken(entry.rows[0].user_id);
  const refreshToken = createRefreshToken(entry.rows[0].user_id);
  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [entry.rows[0].user_id, hashToken(refreshToken)]
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: entry.rows[0].user_id,
      email: entry.rows[0].email,
      fullName: entry.rows[0].full_name,
    },
  };
}

async function refresh(inputRefreshToken) {
  let payload;
  try {
    payload = jwt.verify(inputRefreshToken, env.jwt.refreshSecret);
  } catch (error) {
    throw Object.assign(new Error("Invalid refresh token"), { statusCode: 401 });
  }

  const tokenHash = hashToken(inputRefreshToken);
  const tokenRow = await query(
    `SELECT id, user_id
     FROM refresh_tokens
     WHERE token = ? AND expires_at > NOW()`,
    [tokenHash]
  );
  if (tokenRow.rowCount === 0) {
    throw Object.assign(new Error("Refresh token expired or revoked"), { statusCode: 401 });
  }

  await query("DELETE FROM refresh_tokens WHERE id = ?", [tokenRow.rows[0].id]);

  const accessToken = createAccessToken(payload.sub);
  const refreshToken = createRefreshToken(payload.sub);
  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [payload.sub, hashToken(refreshToken)]
  );

  return { accessToken, refreshToken };
}

async function logout(refreshToken) {
  await query("DELETE FROM refresh_tokens WHERE token = ?", [
    hashToken(refreshToken),
  ]);
}

/** Normalise une ligne SQL (GROUP_CONCAT) vers un objet req.user strictement JSON-sûr. */
function mapAuthRowToUserContext(row) {
  if (!row) return null;
  const roleIds = row.role_ids
    ? String(row.role_ids)
        .split(",")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
    : [];
  const roles = row.roles
    ? String(row.roles)
        .split(",")
        .map((r) => String(r || "").trim())
        .filter(Boolean)
    : [];
  const permissions = row.permissions
    ? String(row.permissions)
        .split(",")
        .map((p) => String(p || "").trim())
        .filter(Boolean)
    : [];
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    email: String(row.email ?? ""),
    full_name: String(row.full_name ?? ""),
    roleIds,
    roles,
    permissions,
  };
}

/**
 * Contexte d’auth pour un utilisateur actif (même requête que le middleware authenticate).
 * À utiliser pour déboguer ou étendre /auth/me sans dupliquer la SQL.
 */
async function loadUserAuthContext(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const result = await query(
    `SELECT u.id, u.email, u.full_name,
            GROUP_CONCAT(DISTINCT ur.role_id ORDER BY ur.role_id SEPARATOR ',') AS role_ids,
            GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',') AS roles,
            GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ',') AS permissions
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = ? AND u.is_active = 1
     GROUP BY u.id, u.email, u.full_name`,
    [uid]
  );
  if (result.rowCount === 0) return null;
  return mapAuthRowToUserContext(result.rows[0]);
}

/**
 * Liste les noms de permissions accordées à un ensemble de rôles (table role_permissions).
 * Utile pour vérifier qu’un rôle « admin » reçoit bien audit:read après migration SQL.
 */
async function getPermissionsFromRoles(roleIds) {
  const ids = (Array.isArray(roleIds) ? roleIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const result = await query(
    `SELECT DISTINCT p.name
     FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id IN (${placeholders})
     ORDER BY p.name`,
    ids
  );
  return result.rows.map((row) => String(row.name || "").trim()).filter(Boolean);
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verify2fa,
  refresh,
  logout,
  loadUserAuthContext,
  getPermissionsFromRoles,
};
