/**
 * Génère / régénère les 5 documents de démo (fichiers + entrées BDD).
 */
require("dotenv").config();
const {
  regenerateDemoDocuments,
  DEMO_DOCUMENTS,
} = require("../src/modules/documents/documents.demo.service");
const { pgPool, query } = require("../src/config/db");

async function main() {
  const result = await regenerateDemoDocuments();
  const docs = await query(
    `SELECT id, title, original_name, status
     FROM documents
     WHERE original_name = ANY($1)
     ORDER BY id`,
    [DEMO_DOCUMENTS.map((d) => d.originalName)]
  );

  console.log("✅ Documents démo prêts");
  console.log(`   Créés : ${result.seeded} | Mis à jour : ${result.updated} | Propriétaire #${result.ownerId}`);
  for (const row of docs.rows) {
    console.log(`   #${row.id} — ${row.title} (${row.original_name})`);
  }
}

main()
  .catch((err) => {
    console.error("Échec génération documents démo:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pgPool.end());
