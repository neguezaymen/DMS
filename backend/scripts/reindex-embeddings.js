/**
 * Régénère les embeddings pour tous les documents actifs (démo / après migration).
 * Usage : node scripts/reindex-embeddings.js
 */
const { query, pgPool } = require("../src/config/db");
const { generateDocumentEmbedding } = require("../src/modules/documents/embedding.service");

async function run() {
  const res = await query(
    `SELECT id FROM documents WHERE status <> 'deleted' ORDER BY id ASC`
  );
  let ok = 0;
  let fail = 0;
  for (const row of res.rows) {
    const id = Number(row.id);
    try {
      const result = await generateDocumentEmbedding(id);
      if (result.ok) {
        ok += 1;
        // eslint-disable-next-line no-console
        console.log(`[ok] document ${id} (${result.source})`);
      } else {
        fail += 1;
      }
    } catch (err) {
      fail += 1;
      // eslint-disable-next-line no-console
      console.warn(`[fail] document ${id}:`, err.message);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Done. success=${ok} failed=${fail}`);
}

run()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
