const express = require("express");
const validate = require("../../middlewares/validate");
const {
  loginSchema,
  refreshSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verify2faSchema,
} = require("./auth.schemas");
const authService = require("./auth.service");
const { logAudit } = require("../audit/audit.service");
const { authenticate } = require("../../middlewares/auth");
const { toJsonSafeDeep } = require("../../utils/jsonSafe");

const router = express.Router();

router.get("/me", authenticate, (req, res) => {
  return res.json(
    toJsonSafeDeep({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.full_name,
        roleIds: req.user.roleIds || [],
        roles: req.user.roles || [],
        permissions: req.user.permissions || [],
      },
    })
  );
});

router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const createdUser = await authService.register(req.validated.body);
    await logAudit({
      actorId: createdUser.id,
      action: "auth.register",
      entityType: "user",
      entityId: createdUser.id,
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, data: createdUser });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const data = await authService.login({ ...req.validated.body, ipAddress: req.ip });
    if (data?.user?.id) {
      await logAudit({
        actorId: data.user.id,
        action: "auth.login",
        entityType: "user",
        entityId: data.user.id,
        ipAddress: req.ip,
      });
    } else if (data?.twoFactorRequired) {
      await logAudit({
        actorId: null,
        action: "auth.login.2fa_challenge_sent",
        entityType: "auth",
        entityId: null,
        metadata: { email: req.validated.body.email },
        ipAddress: req.ip,
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", validate(forgotPasswordSchema), async (req, res, next) => {
  try {
    const response = await authService.forgotPassword(req.validated.body);
    return res.json({ success: true, data: response });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const response = await authService.resetPassword(req.validated.body);
    return res.json({ success: true, data: response });
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-2fa", validate(verify2faSchema), async (req, res, next) => {
  try {
    const data = await authService.verify2fa(req.validated.body);
    await logAudit({
      actorId: data.user.id,
      action: "auth.login.2fa_verified",
      entityType: "user",
      entityId: data.user.id,
      ipAddress: req.ip,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const tokens = await authService.refresh(req.validated.body.refreshToken);
    return res.json({ success: true, data: tokens });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", validate(refreshSchema), async (req, res, next) => {
  try {
    await authService.logout(req.validated.body.refreshToken);
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
