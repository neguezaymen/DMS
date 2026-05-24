const { query } = require("./db");

/** Idempotent schema fixes for databases created before newer columns were added. */
async function applySchemaPatches() {
  await query(
    "ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS comment VARCHAR(500)"
  );
}

module.exports = { applySchemaPatches };
