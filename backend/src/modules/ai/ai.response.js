const env = require("../../config/env");

const IA_PROVIDER = String(env.ai?.provider || process.env.IA_PROVIDER || "gemini")
  .trim()
  .toLowerCase();
const OPENAI_KEY = String(
  env.ai?.openaiApiKey || process.env.OPENAI_API_KEY || "",
).trim();
const GEMINI_KEY = String(
  env.ai?.geminiApiKey || process.env.GEMINI_API_KEY || "",
).trim();

function aiSourceLabel(model) {
  const m = String(model || "");
  if (m.includes("heuristic") || m.includes("regex")) return "nlp";
  if (m.includes("gemini") || (IA_PROVIDER === "gemini" && GEMINI_KEY)) return "gemini";
  if (OPENAI_KEY) return "openai";
  return "unavailable";
}

function buildAiResponse(data, meta = {}) {
  return {
    success: true,
    data,
    meta: {
      source: meta.source || aiSourceLabel(meta.model),
      model: meta.model || null,
      tokensUsed: meta.tokensUsed ?? null,
      quotaRemaining: meta.quotaRemaining ?? null,
      action: meta.action || null,
    },
  };
}

module.exports = {
  buildAiResponse,
  aiSourceLabel,
};
