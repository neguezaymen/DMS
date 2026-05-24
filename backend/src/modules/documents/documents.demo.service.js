const fs = require("fs/promises");
const path = require("path");
const { query } = require("../../config/db");
const { buildDemoFileBuffer } = require("./demo-document-builder");

const uploadDir = path.resolve(__dirname, "../../../uploads");
const demoDir = path.join(uploadDir, "demo");

const DEMO_DOCUMENTS = [
  {
    originalName: "Rapport_Stage_Sahar_Neguez.pdf",
    title: "Rapport de stage — Sahar Neguez",
    category: "Rapport",
    tags: "stage,informatique,PFE",
    status: "active",
    mimeType: "application/pdf",
    description: "Rapport de fin de stage — gestion documentaire et workflows.",
  },
  {
    originalName: "Contrat_Alternance_2025.docx",
    title: "Contrat d'alternance 2025",
    category: "Contrat",
    tags: "alternance,contrat,2025",
    status: "active",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    description: "Contrat d'alternance signé — année 2025.",
  },
  {
    originalName: "Facture_ATTIJARI_BANK.pdf",
    title: "Facture Attijari Bank",
    category: "Facture",
    tags: "finance,facture,banque",
    status: "active",
    mimeType: "application/pdf",
    description: "Facture fournisseur — Attijari Bank.",
  },
  {
    originalName: "Lettre_Motivation_Syrine.pdf",
    title: "Lettre de motivation — Syrine",
    category: "Lettre",
    tags: "motivation,candidature,RH",
    status: "active",
    mimeType: "application/pdf",
    description: "Lettre de motivation pour candidature.",
  },
  {
    originalName: "Devis_Commercial_TELNET.pdf",
    title: "Devis commercial Telnet",
    category: "Devis",
    tags: "commercial,devis,telnet",
    status: "active",
    mimeType: "application/pdf",
    description: "Devis commercial B2B — client Telnet.",
  },
];

const DEMO_ORIGINAL_NAMES = DEMO_DOCUMENTS.map((d) => d.originalName);

async function resolveDemoOwnerId() {
  const admin = await query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'admin' AND u.is_active = 1
     ORDER BY u.id ASC
     LIMIT 1`
  );
  if (admin.rows[0]?.id) return admin.rows[0].id;
  const any = await query(`SELECT id FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1`);
  return any.rows[0]?.id || null;
}

async function writeDemoFile(def) {
  await fs.mkdir(demoDir, { recursive: true });
  const filePath = path.join(demoDir, def.originalName);
  const content = await buildDemoFileBuffer(def.originalName);
  await fs.writeFile(filePath, content);
  return filePath;
}

/** Corbeille tout document hors jeu de démo (liste soutenance propre). */
async function pruneNonDemoDocuments() {
  const placeholders = DEMO_ORIGINAL_NAMES.map(() => "?").join(",");
  await query(
    `UPDATE documents
     SET status = 'deleted', updated_at = NOW()
     WHERE status NOT IN ('deleted', 'archived')
       AND original_name NOT IN (${placeholders})`,
    DEMO_ORIGINAL_NAMES
  );
}

async function documentExistsByOriginalName(originalName) {
  const r = await query(
    `SELECT id FROM documents
     WHERE LOWER(TRIM(original_name)) = LOWER(TRIM(?))
       AND status <> 'deleted'
     LIMIT 1`,
    [originalName]
  );
  return Boolean(r.rows.length);
}

async function insertDemoDocument(def, ownerId) {
  const filePath = await writeDemoFile(def);
  const stats = await fs.stat(filePath);
  await query(
    `INSERT INTO documents
       (title, original_name, file_path, mime_type, size, owner_id, category, status, tags, description, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private')`,
    [
      def.title,
      def.originalName,
      filePath,
      def.mimeType,
      stats.size,
      ownerId,
      def.category,
      def.status,
      def.tags,
      def.description,
    ]
  );
}

/**
 * Assure 5 documents de démo cohérents et retire le bruit d'upload timestamp (admin).
 */
async function ensureDemoDocuments() {
  const ownerId = await resolveDemoOwnerId();
  if (!ownerId) return { seeded: 0, ownerId: null };

  let seeded = 0;
  for (const def of DEMO_DOCUMENTS) {
    const exists = await documentExistsByOriginalName(def.originalName);
    if (exists) continue;
    await insertDemoDocument(def, ownerId);
    seeded += 1;
  }

  return { seeded, ownerId };
}

/** Réécrit les fichiers démo et met à jour / crée les lignes en base. */
async function regenerateDemoDocuments() {
  const ownerId = await resolveDemoOwnerId();
  if (!ownerId) return { seeded: 0, updated: 0, ownerId: null };

  let seeded = 0;
  let updated = 0;

  for (const def of DEMO_DOCUMENTS) {
    const filePath = await writeDemoFile(def);
    const stats = await fs.stat(filePath);
    const existing = await query(
      `SELECT id FROM documents
       WHERE LOWER(TRIM(original_name)) = LOWER(TRIM(?))
       LIMIT 1`,
      [def.originalName]
    );

    if (existing.rows[0]) {
      await query(
        `UPDATE documents
         SET title = ?, file_path = ?, mime_type = ?, size = ?, category = ?, status = 'active',
             tags = ?, description = ?, visibility = 'private', deleted_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [
          def.title,
          filePath,
          def.mimeType,
          stats.size,
          def.category,
          def.tags,
          def.description,
          existing.rows[0].id,
        ]
      );
      updated += 1;
    } else {
      await query(
        `INSERT INTO documents
           (title, original_name, file_path, mime_type, size, owner_id, category, status, tags, description, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private')`,
        [
          def.title,
          def.originalName,
          filePath,
          def.mimeType,
          stats.size,
          ownerId,
          def.category,
          def.status,
          def.tags,
          def.description,
        ]
      );
      seeded += 1;
    }
  }

  await pruneNonDemoDocuments();
  return { seeded, updated, ownerId };
}

module.exports = {
  ensureDemoDocuments,
  regenerateDemoDocuments,
  DEMO_DOCUMENTS,
};
