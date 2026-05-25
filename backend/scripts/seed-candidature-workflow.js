/**
 * Crée le workflow « Candidature – Validation complète », le document démo,
 * les comptes RH/manager de test, et démarre une instance en attente (étape RH).
 *
 * Usage : node scripts/seed-candidature-workflow.js
 */
const bcrypt = require("bcryptjs");
const { pool, pgPool } = require("../src/config/db");
const { ensureDefaultWorkflows } = require("../src/modules/workflows/workflows.defaults.service");
const { regenerateDemoDocuments } = require("../src/modules/documents/documents.demo.service");

const WORKFLOW_NAME = "Candidature – Validation complète";
const DEMO_DOC_TITLE = "Dossier candidature — Jean Dupont";
const DEMO_DOC_ORIGINAL = "Dossier_Candidature_Dupont.pdf";
const LEGACY_DOC_ORIGINAL = "Dossier_Candidature_Aymen.pdf";

const DEMO_USERS = [
  { fullName: "Responsable RH", email: "rh@dms.local", password: "Rh123456!", role: "rh" },
  { fullName: "Manager Equipe", email: "manager@dms.local", password: "Manager123!", role: "manager" },
];

async function ensureDemoUser({ fullName, email, password, role }) {
  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_active)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name`,
    [fullName, email, hashed]
  );
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
  const userId = rows[0]?.id;
  if (!userId) return null;
  await pool.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT ?, id FROM roles WHERE name = ? LIMIT 1`,
    [userId, role]
  );
  return userId;
}

async function getWorkflowIdByName(name) {
  const [rows] = await pool.query(
    "SELECT id FROM workflows WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1",
    [name]
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function getDocumentIdByTitle(title) {
  const [rows] = await pool.query(
    "SELECT id FROM documents WHERE title = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    [title]
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function migrateLegacyCandidatureDoc() {
  const [legacy] = await pool.query(
    "SELECT id FROM documents WHERE original_name = ? AND deleted_at IS NULL LIMIT 1",
    [LEGACY_DOC_ORIGINAL]
  );
  if (!legacy[0]?.id) return;
  await pool.query(
    `UPDATE documents
     SET original_name = ?, title = ?, updated_at = NOW()
     WHERE id = ?`,
    [DEMO_DOC_ORIGINAL, DEMO_DOC_TITLE, legacy[0].id]
  );
}

async function startWorkflowInstance({ workflowId, documentId, actorId }) {
  const [pending] = await pool.query(
    `SELECT id FROM workflow_instances
     WHERE document_id = ? AND workflow_id = ? AND status = 'pending'
     LIMIT 1`,
    [documentId, workflowId]
  );
  if (pending[0]?.id) {
    return { instanceId: Number(pending[0].id), created: false };
  }

  const [steps] = await pool.query(
    `SELECT id, due_hours FROM workflow_steps
     WHERE workflow_id = ?
     ORDER BY step_order ASC
     LIMIT 1`,
    [workflowId]
  );
  const firstStep = steps[0];
  if (!firstStep?.id) {
    throw new Error("Le workflow candidature n'a aucune étape.");
  }

  const dueHours = Number(firstStep.due_hours) || 0;
  let instanceId;
  if (dueHours > 0) {
    const [insertRows] = await pool.query(
      `INSERT INTO workflow_instances
         (document_id, workflow_id, current_step_id, status, started_at, due_date, reminder_sent_at)
       VALUES (?, ?, ?, 'pending', NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR), NULL)`,
      [documentId, workflowId, firstStep.id, dueHours]
    );
    instanceId = Number(insertRows.insertId || insertRows[0]?.id);
  } else {
    const [insertRows] = await pool.query(
      `INSERT INTO workflow_instances
         (document_id, workflow_id, current_step_id, status, started_at, due_date, reminder_sent_at)
       VALUES (?, ?, ?, 'pending', NOW(), NULL, NULL)`,
      [documentId, workflowId, firstStep.id]
    );
    instanceId = Number(insertRows.insertId || insertRows[0]?.id);
  }
  await pool.query("UPDATE documents SET status = 'in_review' WHERE id = ?", [documentId]);
  await pool.query(
    `INSERT INTO workflow_actions (instance_id, step_id, actor_id, action, comment)
     VALUES (?, ?, ?, 'start', ?)`,
    [instanceId, firstStep.id, actorId, "Instance démo — validation candidature"]
  );

  return { instanceId, created: true };
}

async function main() {
  try {
    for (const user of DEMO_USERS) {
      await ensureDemoUser(user);
    }

    await ensureDefaultWorkflows();
    await migrateLegacyCandidatureDoc();
    await regenerateDemoDocuments();

    const workflowId = await getWorkflowIdByName(WORKFLOW_NAME);
    if (!workflowId) {
      throw new Error(`Workflow introuvable : ${WORKFLOW_NAME}`);
    }

    const documentId = await getDocumentIdByTitle(DEMO_DOC_TITLE);
    if (!documentId) {
      throw new Error(`Document démo introuvable : ${DEMO_DOC_TITLE}`);
    }

    const [adminRows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [
      "admin@dms.local",
    ]);
    const adminId = adminRows[0]?.id;
    if (!adminId) {
      throw new Error("Compte admin@dms.local introuvable — lancez npm run db:seed d'abord.");
    }

    const { instanceId, created } = await startWorkflowInstance({
      workflowId,
      documentId,
      actorId: adminId,
    });

    console.log("✅ Workflow candidature prêt pour les tests\n");
    console.log(`   Modèle      : ${WORKFLOW_NAME} (id ${workflowId})`);
    console.log(`   Document    : ${DEMO_DOC_TITLE} (id ${documentId})`);
    console.log(
      `   Instance    : #${instanceId} ${created ? "(créée)" : "(déjà en cours)"} — étape 1 → rh`
    );
    console.log("\n   Comptes de test :");
    console.log("   • rh@dms.local       / Rh123456!       → valider étape 1 (RH)");
    console.log("   • manager@dms.local  / Manager123!  → valider étape 2 (après RH)");
    console.log("   • admin@dms.local    / Admin123!    → peut agir à toutes les étapes");
    console.log("\n   Où tester : Documents → Dossier candidature → onglet Workflow");
    console.log("               ou Workflows → Mes tâches (connecté en RH)");
  } catch (error) {
    console.error("❌ Échec seed candidature :", error.message);
    process.exitCode = 1;
  } finally {
    await pgPool.end();
  }
}

main();
