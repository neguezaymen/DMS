const express = require("express");
const settingsService = require("./settings.service");

const router = express.Router();

router.get("/public", async (req, res, next) => {
  try {
    const maxUpload = await settingsService.getMaxUploadBytes();
    return res.json({ success: true, data: { maxUploadSizeBytes: maxUpload } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
