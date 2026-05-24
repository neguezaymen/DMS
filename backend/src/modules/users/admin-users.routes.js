const express = require("express");
const bcrypt = require("bcryptjs");
const { authenticate, requireAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");

const router = express.Router();

router.use(authenticate, requireAdmin);

function logSql(sql, params = []) {
  // eslint-disable-next-line no-console
  console.log("[SQL] Query:", sql);
  // eslint-disable-next-line no-console
  console.log("[SQL] Params:", params);
}

function normalizeAdminUserRow(row) {
  const rolesCsv = row.roles_csv || "";
  const roles = rolesCsv ? rolesCsv.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const deptCsv = row.departments_csv || "";
  const departments = deptCsv
    ? deptCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const primaryRole = row.role_name || (roles.length ? roles[0] : null) || "user";
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    avatar_path: row.avatar_path,
    is_active: Boolean(row.is_active),
    is_locked: Boolean(row.is_locked),
    lock_expires_at: row.lock_expires_at,
    last_login_at: row.last_login_at,
    role: primaryRole,
    role_id: row.role_id != null ? Number(row.role_id) : null,
    roles,
    departments,
    departments_label: departments.join(", ") || "",
  };
}

function parseOptionalInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseIdList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function readBodyField(body, snakeName, camelName) {
  if (body[snakeName] !== undefined) return body[snakeName];
  return body[camelName];
}

async function resolveRoleId({ roleId, roleName, fallbackToUser = false }) {
  const id = parseOptionalInt(roleId);
  if (id) {
    const role = await query("SELECT id FROM roles WHERE id = ?", [id]);
    return role.rowCount > 0 ? Number(role.rows[0].id) : null;
  }

  if (roleName) {
    const role = await query("SELECT id FROM roles WHERE name = ?", [String(roleName).trim()]);
    return role.rowCount > 0 ? Number(role.rows[0].id) : null;
  }

  if (fallbackToUser) {
    const role = await query("SELECT id FROM roles WHERE name = 'user' LIMIT 1");
    return role.rowCount > 0 ? Number(role.rows[0].id) : null;
  }

  return null;
}

async function loadAdminUserById(id) {
  const row = await query(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.avatar_path,
       u.is_active,
       u.last_login_at,
       u.is_locked,
       u.lock_expires_at,
       (SELECT GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',')
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id) AS roles_csv,
       (SELECT r.id
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
        ORDER BY r.name
        LIMIT 1) AS role_id,
       (SELECT r.name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
        ORDER BY r.name
        LIMIT 1) AS role_name,
       (SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR ',')
        FROM user_departments ud
        INNER JOIN departments d ON d.id = ud.department_id
        WHERE ud.user_id = u.id) AS departments_csv
     FROM users u
     WHERE u.id = ?`,
    [id]
  );

  if (row.rowCount === 0) return null;
  const data = normalizeAdminUserRow(row.rows[0]);
  const depts = await query(
    `SELECT d.id, d.name
     FROM departments d
     INNER JOIN user_departments ud ON ud.department_id = d.id
     WHERE ud.user_id = ?
     ORDER BY d.name`,
    [id]
  );
  data.department_ids = depts.rows.map((d) => Number(d.id));
  data.department_details = depts.rows;
  return data;
}

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const offset = (page - 1) * limit;
    const safeLimit = Math.floor(limit);
    const safeOffset = Math.floor(offset);

    const deptId = req.query.departmentId ? Number(req.query.departmentId) : null;
    const deptClause =
      deptId && Number.isFinite(deptId)
        ? "WHERE EXISTS (SELECT 1 FROM user_departments udf WHERE udf.user_id = u.id AND udf.department_id = ?)"
        : "";
    const deptParams = deptClause ? [deptId] : [];

    const countSql = `SELECT COUNT(*) AS total FROM users u ${deptClause}`;
    logSql(countSql, deptParams);
    const count = await query(countSql, deptParams);

    const listSql = `SELECT
        u.id,
        u.full_name,
        u.email,
        u.avatar_path,
        u.is_active,
        u.last_login_at,
        u.is_locked,
        u.lock_expires_at,
        (SELECT GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',')
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id) AS roles_csv,
        (SELECT r.id
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id
         ORDER BY r.name
         LIMIT 1) AS role_id,
        (SELECT r.name
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id
         ORDER BY r.name
         LIMIT 1) AS role_name,
        (SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR ',')
         FROM user_departments ud
         INNER JOIN departments d ON d.id = ud.department_id
         WHERE ud.user_id = u.id) AS departments_csv
       FROM users u
       ${deptClause}
       ORDER BY u.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    logSql(listSql, deptParams);
    const users = await query(listSql, deptParams);

    const data = users.rows.map((row) => normalizeAdminUserRow(row));
    return res.json({
      success: true,
      data,
      pagination: { page, limit, total: Number(count.rows[0].total) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const user = await loadAdminUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, data: user });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const fullName = String(readBodyField(req.body, "full_name", "fullName") || "").trim();
    const emailRaw = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    const requestedRoleId = readBodyField(req.body, "role_id", "roleId");
    const requestedRoleName = req.body.roleName;
    const departmentIds = parseIdList(readBodyField(req.body, "department_ids", "departmentIds"));

    if (!fullName || !emailRaw || !password) {
      return res.status(400).json({
        success: false,
        message: "Nom complet, e-mail et mot de passe sont requis",
      });
    }
    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe doit contenir au moins 8 caractères",
      });
    }

    const roleId = await resolveRoleId({
      roleId: requestedRoleId,
      roleName: requestedRoleName,
      fallbackToUser: true,
    });
    if (!roleId) {
      return res.status(400).json({ success: false, message: "Rôle invalide" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insertSql = `INSERT INTO users (full_name, email, password_hash, is_active)
       VALUES (?, ?, ?, 1)`;
    const insertParams = [fullName, emailRaw, passwordHash];
    logSql(insertSql, insertParams);
    const insert = await query(insertSql, insertParams);
    const userId = insert.rows.insertId;

    await query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);

    if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      for (const did of departmentIds) {
        await query("INSERT IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)", [
          userId,
          did,
        ]);
      }
    }

    const createdUser = await loadAdminUserById(userId);

    await logAudit({
      actorId: req.user.id,
      action: "admin.users.create",
      entityType: "user",
      entityId: userId,
      metadata: { role_id: roleId, department_ids: departmentIds },
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: createdUser });
  } catch (error) {
    const errno = error.errno || error.code;
    if (errno === 1062 || String(error.sqlMessage || "").includes("Duplicate")) {
      return res.status(409).json({
        success: false,
        message: "Cet e-mail est déjà utilisé",
      });
    }
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const fullName = readBodyField(req.body, "full_name", "fullName");
    const isActive = readBodyField(req.body, "is_active", "isActive");
    const requestedRoleId = readBodyField(req.body, "role_id", "roleId");
    const requestedRoleName = req.body.roleName;
    const departmentIdsValue = readBodyField(req.body, "department_ids", "departmentIds");
    const hasRoleUpdate = requestedRoleId !== undefined || requestedRoleName !== undefined;
    const hasDepartmentUpdate = Array.isArray(departmentIdsValue);
    const activeVal =
      typeof isActive === "boolean"
        ? isActive
          ? 1
          : 0
        : isActive === 0 || isActive === 1
          ? isActive
          : null;

    await query(
      `UPDATE users
       SET full_name = COALESCE(?, full_name),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        fullName != null ? String(fullName).trim() || null : null,
        activeVal,
        req.params.id,
      ]
    );

    let roleId = null;
    if (hasRoleUpdate) {
      roleId = await resolveRoleId({ roleId: requestedRoleId, roleName: requestedRoleName });
      if (!roleId) {
        return res.status(400).json({ success: false, message: "Rôle invalide" });
      }
      await query("DELETE FROM user_roles WHERE user_id = ?", [req.params.id]);
      await query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [req.params.id, roleId]);
    }

    let departmentIds = null;
    if (hasDepartmentUpdate) {
      departmentIds = parseIdList(departmentIdsValue);
      await query("DELETE FROM user_departments WHERE user_id = ?", [req.params.id]);
      for (const did of departmentIds) {
        await query(
          "INSERT IGNORE INTO user_departments (user_id, department_id) VALUES (?, ?)",
          [req.params.id, Number(did)]
        );
      }
    }

    const updatedUser = await loadAdminUserById(req.params.id);

    await logAudit({
      actorId: req.user.id,
      action: "admin.users.update",
      entityType: "user",
      entityId: req.params.id,
      metadata: { full_name: fullName, is_active: isActive, role_id: roleId, department_ids: departmentIds },
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "User updated", data: updatedUser });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await query("UPDATE users SET is_active = 0 WHERE id = ?", [req.params.id]);
    await logAudit({
      actorId: req.user.id,
      action: "admin.users.deactivate",
      entityType: "user",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "User deactivated" });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/unlock", async (req, res, next) => {
  try {
    const user = await query("SELECT email FROM users WHERE id = ?", [req.params.id]);
    if (user.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    await query(
      "UPDATE login_attempts SET attempt_count = 0, locked_until = NULL WHERE email = ?",
      [user.rows[0].email]
    );
    await query("UPDATE users SET is_locked = 0, lock_expires_at = NULL WHERE id = ?", [req.params.id]);
    await logAudit({
      actorId: req.user.id,
      action: "admin.users.unlock",
      entityType: "user",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "User unlocked" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
