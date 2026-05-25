const env = require("../../config/env");

const OPENAI_KEY = String(env.ai?.openaiApiKey || process.env.OPENAI_API_KEY || "").trim();

function aiSourceLabel(model) {
  const m = String(model || "");
  if (m.includes("demo") || m === "demo-heuristic") return "demo";
  if (OPENAI_KEY) return "openai";
  return "demo";
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
