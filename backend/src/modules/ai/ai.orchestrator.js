const { assertOpenAIKey, assertQuota, ensureQuota } = require("./ai.service");
const { buildAiResponse } = require("./ai.response");

/**
 * Exécute une action IA avec contrôle de quota et enveloppe de réponse standard.
 */
async function runAiTask(userId, { action, model, run }) {
  assertOpenAIKey();
  await assertQuota(userId);
  const result = await run();
  const quota = await ensureQuota(userId);
  return buildAiResponse(result.data, {
    action,
    model: result.model || model || null,
    tokensUsed: result.tokensUsed ?? null,
    quotaRemaining: Math.max(0, quota.dailyLimit - quota.usedToday),
    source: result.source,
  });
}

module.exports = {
  runAiTask,
};
