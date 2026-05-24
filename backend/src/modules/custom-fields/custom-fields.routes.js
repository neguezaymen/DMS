const express = require("express");
const { authenticate, requireAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");

const router = express.Router();

/** Champs actifs applicables à une catégorie de document (authentifié). */
router.get("/active", authenticate, async (req, res, next) => {
  try {
    const category = req.query.category || "";
    const rows = await query(
      `SELECT id, name, type, options, document_type, is_active
       FROM custom_fields
       WHERE is_active = 1
         AND (document_type IS NULL OR document_type = '' OR document_type = ?)
       ORDER BY name`,
      [category]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.use(authenticate, requireAdmin);

router.get("/", async (req, res, next) => {
  try {
    const rows = await query(
      "SELECT id, name, type, options, document_type, is_active, created_at FROM custom_fields ORDER BY name"
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, type, options, documentType, isActive = true } = req.body;
    if (!name || !type) {
      return res.status(400).json({ success: false, message: "name et type requis" });
    }
    const opts =
      options != null ? (typeof options === "string" ? options : JSON.stringify(options)) : null;
    const ins = await query(
      `INSERT INTO custom_fields (name, type, options, document_type, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [String(name).trim(), type, opts, documentType || null, isActive ? 1 : 0]
    );
    await logAudit({
      actorId: req.user.id,
      action: "custom_fields.create",
      entityType: "custom_field",
      entityId: String(ins.rows.insertId),
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: { id: ins.rows.insertId } });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { name, type, options, documentType, isActive } = req.body;
    const cur = await query("SELECT * FROM custom_fields WHERE id = ?", [req.params.id]);
    if (cur.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const row = cur.rows[0];
    const opts =
      options !== undefined
        ? typeof options === "string"
          ? options
          : JSON.stringify(options)
        : row.options;
    await query(
      `UPDATE custom_fields SET
         name = ?,
         type = ?,
         options = ?,
         document_type = ?,
         is_active = ?
       WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : row.name,
        type !== undefined ? type : row.type,
        opts,
        documentType !== undefined ? documentType : row.document_type,
        isActive !== undefined ? (isActive ? 1 : 0) : row.is_active,
        req.params.id,
      ]
    );
    await logAudit({
      actorId: req.user.id,
      action: "custom_fields.update",
      entityType: "custom_field",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Mis à jour" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await query("DELETE FROM custom_fields WHERE id = ?", [req.params.id]);
    await logAudit({
      actorId: req.user.id,
      action: "custom_fields.delete",
      entityType: "custom_field",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Supprimé" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
