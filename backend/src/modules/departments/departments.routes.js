const express = require("express");
const { authenticate, requireAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");

const router = express.Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    const rows = await query(
      "SELECT id, name, description, created_at FROM departments ORDER BY name ASC"
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return next(error);
  }
});

/** Détail par département : utilisateurs + décomptes (pour la page Départements admin). */
router.get("/overview", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const depts = await query(
      `SELECT
         d.id,
         d.name,
         d.description,
         COUNT(DISTINCT ud.user_id) AS userCount,
         COUNT(DISTINCT doc.id) AS docCount
       FROM departments d
       LEFT JOIN user_departments ud ON ud.department_id = d.id
       LEFT JOIN documents doc
         ON doc.owner_id = ud.user_id
        AND doc.deleted_at IS NULL
        AND COALESCE(doc.status, '') <> 'deleted'
       GROUP BY d.id, d.name, d.description
       ORDER BY d.name ASC`
    );

    const members = await query(
      `SELECT
         ud.department_id,
         u.id,
         u.full_name,
         COUNT(DISTINCT doc.id) AS docCount
       FROM user_departments ud
       INNER JOIN users u ON u.id = ud.user_id
       LEFT JOIN documents doc
         ON doc.owner_id = u.id
        AND doc.deleted_at IS NULL
        AND COALESCE(doc.status, '') <> 'deleted'
       GROUP BY ud.department_id, u.id, u.full_name
       ORDER BY u.full_name ASC`
    );

    const usersByDept = new Map();
    for (const row of members.rows) {
      const key = Number(row.department_id);
      const users = usersByDept.get(key) || [];
      users.push({
        id: row.id,
        full_name: row.full_name,
        docCount: Number(row.docCount || 0),
      });
      usersByDept.set(key, users);
    }

    const data = depts.rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      userCount: Number(d.userCount || 0),
      docCount: Number(d.docCount || 0),
      users: usersByDept.get(Number(d.id)) || [],
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post("/", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ success: false, message: "Nom requis (min. 2 caractères)" });
    }
    const ins = await query(
      "INSERT INTO departments (name, description) VALUES (?, ?)",
      [String(name).trim(), description || null]
    );
    await logAudit({
      actorId: req.user.id,
      action: "departments.create",
      entityType: "department",
      entityId: String(ins.rows.insertId),
      metadata: { name },
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: { id: ins.rows.insertId } });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    await query(
      "UPDATE departments SET name = COALESCE(?, name), description = ? WHERE id = ?",
      [name ? String(name).trim() : null, description ?? null, req.params.id]
    );
    await logAudit({
      actorId: req.user.id,
      action: "departments.update",
      entityType: "department",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Mis à jour" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    await query("DELETE FROM departments WHERE id = ?", [req.params.id]);
    await logAudit({
      actorId: req.user.id,
      action: "departments.delete",
      entityType: "department",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Supprimé" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
