const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  /**
   * URL PostgreSQL unique (Neon ou compatible).
   * Format : postgresql://user:pass@host/db?sslmode=require
   */
  databaseUrl: process.env.DATABASE_URL || "",
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  app: {
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
    resetPasswordUrl:
      process.env.RESET_PASSWORD_URL || "http://localhost:5173/reset-password",
    /** URL publique atteignable par les serveurs Microsoft (aperçu Office). Défaut : localhost + PORT */
    publicApiUrl: process.env.PUBLIC_API_URL || "",
  },
  uploads: {
    /** Défaut 10 Mo si absent ; surcharge possible via app_settings ou MAX_UPLOAD_SIZE */
    maxBytes: Number(process.env.MAX_UPLOAD_SIZE || 10 * 1024 * 1024),
  },
  mail: {
    from: process.env.SMTP_FROM || "noreply@dms.local",
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
  ai: {
    provider: (process.env.IA_PROVIDER || "gemini").toLowerCase(),
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    dailyLimit: Number(process.env.IA_DAILY_LIMIT || 300),
    defaultModel:
      process.env.IA_MODEL ||
      (String(process.env.IA_PROVIDER || "gemini").toLowerCase() === "openai"
        ? "gpt-4.1-nano"
        : "gemini-2.5-flash-lite"),
  },
};

module.exports = env;
