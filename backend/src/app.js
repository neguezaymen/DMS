const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const env = require("./config/env");
const { loggerMiddleware } = require("./middlewares/logger");
const { globalRateLimiter } = require("./middlewares/rateLimiter");
const errorHandler = require("./middlewares/errorHandler");
const apiRoutes = require("./routes");
const { testConnection } = require("./config/db");

const app = express();

const frameAncestorOrigins = [
  "'self'",
  "https://view.officeapps.live.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  env.app.frontendUrl,
].filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: frameAncestorOrigins,
        frameSrc: ["'self'", "https://view.officeapps.live.com"],
      },
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        env.app.frontendUrl,
      ].filter(Boolean);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));
app.use(loggerMiddleware);

app.get("/health", async (req, res) => {
  try {
    await testConnection();
    return res.json({ success: true, status: "ok", db: "connected" });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: "degraded",
      db: "disconnected",
      message: "Database unreachable",
    });
  }
});

app.use(globalRateLimiter);

app.use("/api/v1", apiRoutes);
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use(errorHandler);

module.exports = app;
