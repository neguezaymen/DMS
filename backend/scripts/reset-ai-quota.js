#!/usr/bin/env node
/**
 * Supprime l'historique IA (generations + usages) et remet les quotas à zéro.
 * Usage: node scripts/reset-ai-quota.js [userId]
 */
require("dotenv").config();
const { query } = require("../src/config/db");
const { resetUserAiState } = require("../src/modules/ai/ai.service");

async function main() {
  const userIdArg = process.argv[2];
  if (userIdArg) {
    const userId = Number(userIdArg);
    const quota = await resetUserAiState(userId);
    console.log(`✅ Utilisateur #${userId} — quota: ${quota.usedToday}/${quota.dailyLimit}`);
    return;
  }

  const users = await query(`SELECT id, email FROM users ORDER BY id`);
  for (const u of users.rows) {
    const quota = await resetUserAiState(u.id);
    console.log(`✅ ${u.email} — quota: ${quota.usedToday}/${quota.dailyLimit}`);
  }
  console.log(`\nHistorique IA effacé et quotas réinitialisés pour ${users.rows.length} utilisateur(s).`);
}

main().catch((err) => {
  console.error("Échec:", err.message);
  process.exit(1);
});
