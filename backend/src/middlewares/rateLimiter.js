const rateLimit = require("express-rate-limit");
const env = require("../config/env");

/** Dev + HMR + React StrictMode can burst hundreds of API calls; keep prod limit strict. */
const isDev = env.nodeEnv !== "production";

const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

module.exports = { globalRateLimiter };
