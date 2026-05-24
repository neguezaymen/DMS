const { z } = require("zod");

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
    token: z.string().min(20),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const verify2faSchema = z.object({
  body: z.object({
    twoFactorSessionToken: z.string().min(20),
    code: z.string().regex(/^\d{6}$/),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

module.exports = {
  loginSchema,
  refreshSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verify2faSchema,
};
