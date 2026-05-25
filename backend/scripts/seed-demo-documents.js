/**
 * Génère / régénère les documents de démo (fichiers + BDD + extraction + embeddings).
 */
require("dotenv").config();
const {
  regenerateDemoDocuments,
  DEMO_DOCUMENTS,
} = require("../src/modules/documents/documents.demo.service");
const { ensureDefaultWorkflows } = require("../src/modules/workflows/workflows.defaults.service");
const { pgPool, query } = require("../src/config/db");

async function main() {
  await ensureDefaultWorkflows();
  const result = await regenerateDemoDocuments();
  const docs = await query(
    `SELECT id, title, original_name, category, status,
            LENGTH(COALESCE(extracted_text, '')) AS text_len
     FROM documents
     WHERE original_name = ANY($1)
     ORDER BY id`,
    [DEMO_DOCUMENTS.map((d) => d.originalName)]
  );

  console.log("✅ Documents démo prêts pour tests IA");
  console.log(
    `   Créés : ${result.seeded} | Mis à jour : ${result.updated} | Indexés : ${result.indexed} | Embeddings : ${result.embedded} | Échecs : ${result.failed || 0}`
  );
  for (const row of docs.rows) {
    console.log(
      `   #${row.id} — ${row.title} [${row.category}] — texte: ${row.text_len || 0} car.`
    );
  }
}

main()
  .catch((err) => {
    console.error("Échec génération documents démo:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pgPool.end());
