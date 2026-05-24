const express = require("express");
const { authenticate, requireAdmin } = require("../../middlewares/auth");
const settingsService = require("./settings.service");

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get("/", async (req, res, next) => {
  try {
    const map = await settingsService.getAllSettings();
    const maxUpload = await settingsService.getMaxUploadBytes();
    return res.json({
      success: true,
      data: { settings: map, maxUploadSizeBytes: maxUpload },
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    if (req.body.maxUploadSizeBytes != null) {
      await settingsService.setMaxUploadBytes(req.body.maxUploadSizeBytes);
    }
    return res.json({ success: true, message: "Paramètres enregistrés" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
