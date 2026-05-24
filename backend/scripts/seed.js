/**
 * Seed initial : rôles, départements, utilisateur admin, workflows démo, documents démo.
 * S'appuie sur le shim `pool` (PostgreSQL via Neon).
 */
const bcrypt = require("bcryptjs");
const { pool, pgPool } = require("../src/config/db");

async function seed() {
  try {
    await pool.query(
      `INSERT INTO roles (name, description) VALUES
        ('admin',     'Administrateur'),
        ('user',      'Utilisateur'),
        ('manager',   'Manager'),
        ('comptable', 'Comptable'),
        ('rh',        'Ressources humaines')
       ON CONFLICT (name) DO NOTHING`
    );

    const hashedPassword = await bcrypt.hash("Admin123!", 10);

    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, is_active)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name     = EXCLUDED.full_name`,
      ["Administrateur", "admin@dms.local", hashedPassword, 1]
    );

    const [adminRows] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      ["admin@dms.local"]
    );
    const adminUserId = adminRows[0]?.id;
    if (adminUserId) {
      await pool.query("DELETE FROM user_roles WHERE user_id = ?", [adminUserId]);
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT ?, id FROM roles WHERE name = 'admin' LIMIT 1`,
        [adminUserId]
      );
    }

    const { ensureDefaultWorkflows } = require("../src/modules/workflows/workflows.defaults.service");
    const { ensureDemoDocuments } = require("../src/modules/documents/documents.demo.service");
    await ensureDefaultWorkflows();
    await ensureDemoDocuments();

    console.log("✅ Seed terminé — compte admin : admin@dms.local / Admin123!");
    console.log("   Modèles workflow et documents de démo initialisés.");
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pgPool.end();
  }
}

seed();
