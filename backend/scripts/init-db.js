/**
 * Crée toutes les tables du schéma (idempotent) sur la base PostgreSQL définie
 * par DATABASE_URL. Remplace les anciennes migrations MySQL `migrate.js` et
 * `migrate-pg.js`.
 */
const fs = require("fs/promises");
const path = require("path");
const { pgPool } = require("../src/config/db");

async function run() {
  const schemaPath = path.resolve(__dirname, "../db-schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  console.log("Application du schéma PostgreSQL …");
  const client = await pgPool.connect();
  try {
    await client.query(sql);
    console.log("✅ Schéma appliqué.");
  } finally {
    client.release();
  }
}

run()
  .catch((err) => {
    console.error("Init DB échouée :", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
