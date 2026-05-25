const { query } = require("../../config/db");

const LEGACY_DUPLICATE_NAMES = ["Validation contrat", "validation contrat"];

const DEFAULT_WORKFLOWS = [
  {
    name: "Contrat – Validation simple",
    description: "Validation en 2 étapes : Manager → Admin",
    documentCategory: "Contrat",
    steps: [
      { stepOrder: 1, roleName: "manager", dueHours: 48, reminderHours: 12 },
      { stepOrder: 2, roleName: "admin", dueHours: 72, reminderHours: 24 },
    ],
  },
  {
    name: "Facture – Relecture",
    description: "Relecture comptable avant validation",
    documentCategory: "Facture",
    steps: [{ stepOrder: 1, roleName: "comptable", dueHours: 24, reminderHours: 6 }],
  },
  {
    name: "Rapport – Relecture qualité",
    description: "Relecture puis validation responsable",
    documentCategory: "Rapport",
    steps: [
      { stepOrder: 1, roleName: "user", dueHours: 48, reminderHours: 12 },
      { stepOrder: 2, roleName: "manager", dueHours: 48, reminderHours: 12 },
    ],
  },
  {
    name: "Lettre de motivation – Validation RH",
    description: "Validation RH en une étape",
    documentCategory: "Lettre",
    steps: [{ stepOrder: 1, roleName: "rh", dueHours: 24, reminderHours: 6 }],
  },
  {
    name: "Candidature – Validation complète",
    description: "Recrutement en 2 étapes : pré-sélection RH → décision manager",
    documentCategory: "Candidature",
    steps: [
      { stepOrder: 1, roleName: "rh", dueHours: 48, reminderHours: 12 },
      { stepOrder: 2, roleName: "manager", dueHours: 72, reminderHours: 24 },
    ],
  },
];

const DEMO_ROLES = [
  ["comptable", "Comptable — relecture factures"],
  ["rh", "Ressources humaines — validation candidatures"],
];

async function ensureDemoRoles() {
  for (const [name, description] of DEMO_ROLES) {
    await query(
      `INSERT IGNORE INTO roles (name, description) VALUES (?, ?)`,
      [name, description]
    );
  }
}

async function getRoleId(roleName) {
  const r = await query(`SELECT id FROM roles WHERE LOWER(name) = LOWER(?) LIMIT 1`, [roleName]);
  return r.rows[0]?.id ? Number(r.rows[0].id) : null;
}

/** Supprime les doublons (conserve le modèle le plus récent par nom). */
async function deduplicateWorkflowsByName() {
  const dupes = await query(
    `SELECT LOWER(TRIM(name)) AS norm_name, GROUP_CONCAT(id ORDER BY created_at DESC, id DESC) AS ids
     FROM workflows
     GROUP BY LOWER(TRIM(name))
     HAVING COUNT(*) > 1`
  );
  for (const row of dupes.rows) {
    const ids = String(row.ids || "")
      .split(",")
      .map((id) => Number(id))
      .filter(Boolean);
    const [, ...toRemove] = ids;
    for (const id of toRemove) {
      await query(`DELETE FROM workflows WHERE id = ?`, [id]);
    }
  }
}

async function removeLegacyValidationContrat() {
  for (const legacyName of LEGACY_DUPLICATE_NAMES) {
    await query(`DELETE FROM workflows WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))`, [legacyName]);
  }
  await query(`DELETE FROM workflows WHERE TRIM(COALESCE(name, '')) = ''`);
  const legacyPatterns = ["validation document", "validation contrat"];
  for (const pattern of legacyPatterns) {
    await query(`DELETE FROM workflows WHERE LOWER(TRIM(name)) LIKE ?`, [`%${pattern}%`]);
  }
}

async function workflowExistsByName(name) {
  const r = await query(`SELECT id FROM workflows WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`, [
    name,
  ]);
  return Boolean(r.rows.length);
}

async function createWorkflowWithSteps(def) {
  const created = await query(
    `INSERT INTO workflows (name, description, document_category)
     VALUES (?, ?, ?)`,
    [def.name, def.description, def.documentCategory]
  );
  const workflowId = created.rows.insertId;
  for (const step of def.steps) {
    const roleId = await getRoleId(step.roleName);
    if (!roleId) {
      // eslint-disable-next-line no-console
      console.warn(`[workflows.defaults] Rôle introuvable: ${step.roleName}`);
      continue;
    }
    await query(
      `INSERT INTO workflow_steps (workflow_id, step_order, assignee_type, assignee_id, due_hours, reminder_hours)
       VALUES (?, ?, 'role', ?, ?, ?)`,
      [workflowId, step.stepOrder, roleId, step.dueHours, step.reminderHours]
    );
  }
  return workflowId;
}

async function removeVisualWorkflows() {
  await query(`DELETE FROM workflow_instances WHERE COALESCE(is_visual, 0) = 1`);
  await query(`DELETE FROM workflows WHERE COALESCE(is_visual, 0) = 1`);
}

/**
 * Nettoie les doublons, retire les anciens « Validation contrat »,
 * puis assure les modèles de démo linéaires.
 */
async function ensureDefaultWorkflows() {
  await ensureDemoRoles();
  await removeVisualWorkflows();
  await deduplicateWorkflowsByName();
  await removeLegacyValidationContrat();
  await deduplicateWorkflowsByName();

  for (const def of DEFAULT_WORKFLOWS) {
    const exists = await workflowExistsByName(def.name);
    if (exists) continue;
    await createWorkflowWithSteps(def);
  }
}

module.exports = {
  ensureDefaultWorkflows,
  deduplicateWorkflowsByName,
  DEFAULT_WORKFLOWS,
};
