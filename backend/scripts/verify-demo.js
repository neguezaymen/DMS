const { query } = require("../src/config/db");

(async () => {
  const w = await query("SELECT id, name FROM workflows ORDER BY created_at DESC");
  console.log("workflows:", w.rows);
  const d = await query(
    "SELECT id, title, original_name, category, status FROM documents WHERE status <> 'deleted' ORDER BY created_at DESC LIMIT 12"
  );
  console.log("documents:", d.rows);
  process.exit(0);
})();
