const express = require("express");
const { authenticate, requireAdmin } = require("../../middlewares/auth");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const { runArchivingJob } = require("./archiving.service");

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get("/", async (req, res, next) => {
  try {
    const rows = await query(
      "SELECT * FROM archiving_rules ORDER BY created_at DESC"
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const {
      name,
      conditionField,
      conditionOperator,
      conditionValue,
      daysInactive = 30,
      isActive = true,
    } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "name requis" });
    }
    const ins = await query(
      `INSERT INTO archiving_rules
       (name, condition_field, condition_operator, condition_value, days_inactive, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        conditionField || "status",
        conditionOperator || "=",
        conditionValue ?? null,
        Math.max(1, Number(daysInactive) || 30),
        isActive ? 1 : 0,
      ]
    );
    await logAudit({
      actorId: req.user.id,
      action: "archiving_rules.create",
      entityType: "archiving_rule",
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
    const {
      name,
      conditionField,
      conditionOperator,
      conditionValue,
      daysInactive,
      isActive,
    } = req.body;
    const cur = await query("SELECT * FROM archiving_rules WHERE id = ?", [req.params.id]);
    if (cur.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const r = cur.rows[0];
    await query(
      `UPDATE archiving_rules SET
         name = ?,
         condition_field = ?,
         condition_operator = ?,
         condition_value = ?,
         days_inactive = ?,
         is_active = ?
       WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : r.name,
        conditionField !== undefined ? conditionField : r.condition_field,
        conditionOperator !== undefined ? conditionOperator : r.condition_operator,
        conditionValue !== undefined ? conditionValue : r.condition_value,
        daysInactive !== undefined ? Math.max(1, Number(daysInactive) || 30) : r.days_inactive,
        isActive !== undefined ? (isActive ? 1 : 0) : r.is_active,
        req.params.id,
      ]
    );
    await logAudit({
      actorId: req.user.id,
      action: "archiving_rules.update",
      entityType: "archiving_rule",
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
    await query("DELETE FROM archiving_rules WHERE id = ?", [req.params.id]);
    await logAudit({
      actorId: req.user.id,
      action: "archiving_rules.delete",
      entityType: "archiving_rule",
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: "Supprimé" });
  } catch (error) {
    return next(error);
  }
});

router.post("/run-now", async (req, res, next) => {
  try {
    const result = await runArchivingJob({ actorId: req.user.id });
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
