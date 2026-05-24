const express = require("express");
const { authenticate } = require("../../middlewares/auth");
const { query } = require("../../config/db");

const router = express.Router();

router.get("/", authenticate, async (req, res, next) => {
  try {
    const rows = await query("SELECT id, name FROM roles ORDER BY name ASC");
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
