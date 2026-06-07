const fs = require("fs/promises");
const path = require("path");
const { query } = require("../../config/db");
const { buildDemoFileBuffer } = require("./demo-document-builder");
const { queueTextExtraction, extractAndStoreText } = require("../../jobs/extract-text.job");
const { generateDocumentEmbedding } = require("./embedding.service");

const uploadDir = path.resolve(__dirname, "../../../uploads");
const demoDir = path.join(uploadDir, "demo");

const DEMO_DOCUMENTS = [
  {
    originalName: "Rapport_Stage_Sahar_Neguez.pdf",
    title: "Rapport de stage — Sahar Neguez",
    category: "Rapport",
    tags: "stage,informatique,PFE,RGPD",
    status: "active",
    mimeType: "application/pdf",
    description: "Rapport de fin de stage — DMS, workflows et analyse conformité RGPD.",
  },
  {
    originalName: "Contrat_Alternance_2025.docx",
    title: "Contrat d'alternance 2025-2026",
    category: "Contrat",
    tags: "alternance,contrat,2026",
    status: "active",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    description: "Contrat d'alternance signé — année 2025-2026.",
  },
  {
    originalName: "Contrat_Prestation_Risque.pdf",
    title: "Contrat prestation IT — clauses sensibles",
    category: "Contrat",
    tags: "contrat,legal,risque,fournisseur",
    status: "active",
    mimeType: "application/pdf",
    description: "Brouillon contractuel avec pénalités et non-concurrence — test conformité IA.",
  },
  {
    originalName: "Facture_ATTIJARI_BANK.pdf",
    title: "Facture Attijari Bank",
    category: "Facture",
    tags: "finance,facture,banque",
    status: "active",
    mimeType: "application/pdf",
    description: "Facture fournisseur Attijari — montants, échéance et IBAN pour extraction IA.",
  },
  {
    originalName: "Facture_Duplicate_ATTIJARI.pdf",
    title: "Facture Attijari Bank (doublon)",
    category: "Facture",
    tags: "finance,facture,banque,duplicate",
    status: "active",
    mimeType: "application/pdf",
    description: "Facture quasi-identique — test déduplication et alertes IA.",
  },
  {
    originalName: "Lettre_Motivation_Syrine.pdf",
    title: "Lettre de motivation — Syrine",
    category: "Lettre",
    tags: "motivation,candidature,RH",
    status: "active",
    mimeType: "application/pdf",
    description: "Lettre de motivation pour candidature stage full-stack.",
  },
  {
    originalName: "Dossier_Candidature_Dupont.pdf",
    title: "Dossier candidature — Jean Dupont",
    category: "Candidature",
    tags: "candidature,CV,stage,RH",
    status: "active",
    mimeType: "application/pdf",
    description: "Dossier complet candidature stage full-stack — métadonnées candidat/poste.",
  },
  {
    originalName: "Devis_Commercial_TELNET.pdf",
    title: "Devis commercial Telnet",
    category: "Devis",
    tags: "commercial,devis,telnet",
    status: "active",
    mimeType: "application/pdf",
    description: "Devis B2B Telnet — montants TTC et client pour extraction IA.",
  },
  {
    originalName: "Politique_Retention_RGPD.pdf",
    title: "Politique de rétention RGPD",
    category: "Conformité",
    tags: "rgpd,conformite,retention,politique",
    status: "active",
    mimeType: "application/pdf",
    description: "Politique interne RGPD — durées de conservation et droits des personnes.",
  },
];

const DEMO_CUSTOM_FIELDS = [
  { name: "Date document", type: "date", documentType: "Facture" },
  { name: "Montant TTC", type: "text", documentType: "Facture" },
  { name: "Client", type: "text", documentType: "Facture" },
  { name: "Fournisseur", type: "text", documentType: "Facture" },
  { name: "N° document", type: "text", documentType: "Facture" },
  { name: "Échéance", type: "date", documentType: "Facture" },
  { name: "Montant TTC", type: "text", documentType: "Devis" },
  { name: "Client", type: "text", documentType: "Devis" },
  { name: "N° document", type: "text", documentType: "Devis" },
  { name: "Date document", type: "date", documentType: "Devis" },
  { name: "Candidat", type: "text", documentType: "Candidature" },
  { name: "Poste", type: "text", documentType: "Candidature" },
  { name: "Poste", type: "text", documentType: "Lettre" },
  { name: "Date document", type: "date", documentType: "Contrat" },
  { name: "Client", type: "text", documentType: "Contrat" },
  { name: "Fournisseur", type: "text", documentType: "Contrat" },
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

async function ensureDemoCustomFields() {
  let created = 0;
  for (const field of DEMO_CUSTOM_FIELDS) {
    const existing = await query(
      `SELECT id FROM custom_fields
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
         AND COALESCE(document_type, '') = COALESCE(?, '')
       LIMIT 1`,
      [field.name, field.documentType]
    );
    if (existing.rows[0]) continue;
    await query(
      `INSERT INTO custom_fields (name, type, options, document_type, is_active)
       VALUES (?, ?, NULL, ?, 1)`,
      [field.name, field.type, field.documentType]
    );
    created += 1;
  }
  return { created };
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

function indexDemoDocument(documentId, def, filePath) {
  queueTextExtraction({
    documentId,
    filePath,
    mimeType: def.mimeType,
    originalName: def.originalName,
  });
}

async function extractAndEmbedDemoDocument(documentId, def, filePath) {
  let text = "";
  try {
    text = await extractAndStoreText({
      documentId,
      filePath,
      mimeType: def.mimeType,
      originalName: def.originalName,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[demo-docs] extract failed ${def.originalName}:`, error.message);
  }

  if (!String(text || "").trim()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[demo-docs] Aucun texte extrait pour ${def.originalName} — l'IA ne pourra pas analyser ce fichier.`,
    );
  }

  const embed = await generateDocumentEmbedding(documentId);
  return { embedded: Boolean(embed?.ok), source: embed?.source || null, textLen: String(text || "").length };
}

async function reindexAllDemoDocuments() {
  let indexed = 0;
  let embedded = 0;
  let failed = 0;
  for (const def of DEMO_DOCUMENTS) {
    const row = await query(
      `SELECT id, file_path FROM documents
       WHERE LOWER(TRIM(original_name)) = LOWER(TRIM(?))
         AND status <> 'deleted'
       LIMIT 1`,
      [def.originalName]
    );
    if (!row.rows[0]) continue;
    const documentId = Number(row.rows[0].id);
    const filePath = row.rows[0].file_path || path.join(demoDir, def.originalName);
    try {
      const result = await extractAndEmbedDemoDocument(documentId, def, filePath);
      indexed += 1;
      if (result.embedded) embedded += 1;
    } catch (error) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.warn(`[demo-docs] Extraction/embed failed for ${def.originalName}:`, error.message);
    }
  }
  return { indexed, embedded, failed };
}

async function insertDemoDocument(def, ownerId) {
  const filePath = await writeDemoFile(def);
  const stats = await fs.stat(filePath);
  const ins = await query(
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
  const documentId = Number(ins.insertId);
  if (documentId) indexDemoDocument(documentId, def, filePath);
}

/**
 * Assure les documents de démo cohérents (insertion si absents).
 */
async function ensureDemoDocuments() {
  const ownerId = await resolveDemoOwnerId();
  if (!ownerId) return { seeded: 0, ownerId: null };

  await ensureDemoCustomFields();

  let seeded = 0;
  for (const def of DEMO_DOCUMENTS) {
    const exists = await documentExistsByOriginalName(def.originalName);
    if (exists) continue;
    await insertDemoDocument(def, ownerId);
    seeded += 1;
  }

  return { seeded, ownerId };
}

/** Réécrit les fichiers démo, met à jour / crée les lignes, extrait le texte et régénère les embeddings. */
async function regenerateDemoDocuments() {
  const ownerId = await resolveDemoOwnerId();
  if (!ownerId) return { seeded: 0, updated: 0, ownerId: null, indexed: 0, embedded: 0 };

  await ensureDemoCustomFields();

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
      const documentId = Number(existing.rows[0].id);
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
          documentId,
        ]
      );
      updated += 1;
    } else {
      const ins = await query(
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
  const { indexed, embedded, failed } = await reindexAllDemoDocuments();

  return { seeded, updated, ownerId, indexed, embedded, failed };
}

module.exports = {
  ensureDemoDocuments,
  regenerateDemoDocuments,
  ensureDemoCustomFields,
  reindexAllDemoDocuments,
  DEMO_DOCUMENTS,
};
