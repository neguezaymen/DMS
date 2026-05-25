const archiver = require("archiver");
const { PassThrough } = require("stream");
const { ModernPdfBuilder, buildModernTextPdf } = require("./pdf-layout");

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styledParagraph(text, style = "Normal") {
  const escaped = escapeXml(text);
  if (style === "Title") {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escaped}</w:t></w:r></w:p>`;
  }
  if (style === "Heading1") {
    return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1F3A8A"/></w:rPr><w:t>${escaped}</w:t></w:r></w:p>`;
  }
  if (style === "Heading2") {
    return `<w:p><w:pPr><w:spacing w:before="180" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${escaped}</w:t></w:r></w:p>`;
  }
  if (style === "Muted") {
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t>${escaped}</w:t></w:r></w:p>`;
  }
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

/**
 * @param {Array<{ text: string, style?: string }>} blocks
 * @returns {Promise<Buffer>}
 */
function buildDocx(blocks) {
  const body = blocks.map((b) => styledParagraph(b.text, b.style || "Normal")).join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const zip = archiver("zip", { zlib: { level: 9 } });
    zip.on("error", reject);
    zip.pipe(stream);
    zip.append(contentTypes, { name: "[Content_Types].xml" });
    zip.append(rels, { name: "_rels/.rels" });
    zip.append(wordRels, { name: "word/_rels/document.xml.rels" });
    zip.append(documentXml, { name: "word/document.xml" });
    zip.finalize();
  });
}

async function buildRapportStagePdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "ISAMM · WebSolutions · DMS Workspace",
  });

  pdf.drawBrandHeader({
    eyebrow: "Rapport de stage · PFE",
    title: "Rapport de stage",
    subtitle: "Projet de Fin d'Études — Gestion documentaire intelligente",
    badge: "2024-2025",
    meta: [
      { label: "Stagiaire", value: "Sahar Neguez" },
      { label: "Encadrant", value: "M. Karim Ben Salah" },
      { label: "Période", value: "Fév. — Juin 2025" },
    ],
  });

  pdf.drawTagRow(["React", "Node.js", "PostgreSQL", "Workflows", "IA"]);

  pdf.drawSectionTitle("1. Introduction", { numbered: true });
  pdf.drawParagraph(
    "Ce rapport présente le travail réalisé au sein de WebSolutions SARL dans le cadre du développement d'une plateforme DMS (Document Management System) destinée à centraliser, sécuriser et automatiser le cycle de vie des documents administratifs et métiers."
  );

  pdf.drawSectionTitle("2. Contexte et objectifs", { numbered: true });
  pdf.drawBulletList([
    "Remplacer les échanges par e-mail par un dépôt unique et traçable.",
    "Mettre en place des workflows de validation multi-niveaux (RH, manager).",
    "Offrir une recherche full-text et sémantique sur les contenus indexés.",
    "Intégrer des assistants IA : résumé, classification, extraction de métadonnées.",
  ]);

  pdf.drawSectionTitle("3. Missions réalisées", { numbered: true });
  pdf.drawBulletList([
    "Analyse des besoins métiers et rédaction du cahier des charges fonctionnel.",
    "Conception de l'architecture technique (React, Express, Neon PostgreSQL).",
    "Implémentation des modules documents, workflows, notifications et audit.",
    "Intégration IA : génération batch, hub IA, insights à l'upload.",
    "Tests, documentation utilisateur et préparation de la soutenance.",
  ]);

  pdf.drawSectionTitle("4. Stack technique", { numbered: true });
  pdf.drawTable(
    ["Couche", "Technologies"],
    [
      ["Frontend", "React 19, TypeScript, Tailwind, shadcn/ui"],
      ["Backend", "Express, JWT, Resend, pgvector"],
      ["Données", "PostgreSQL (Neon), embeddings"],
      ["DevOps", "Vite, Docker, CI"],
    ],
    { colWidths: [120, 375] }
  );

  pdf.drawSectionTitle("5. Conclusion", { numbered: true });
  pdf.drawParagraph(
    "Ce stage a permis de mener un projet complet, de la conception à la mise en production d'une solution DMS moderne. Les compétences acquises en architecture logicielle et gestion documentaire seront réutilisées en entreprise."
  );

  pdf.drawSectionTitle("6. Conformité RGPD", { numbered: true });
  pdf.drawParagraph(
    "Une analyse de conformité a identifié la nécessité de formaliser une politique de rétention des documents RH et financiers. Recommandation : archivage 5 ans pour les contrats, 10 ans pour les factures, anonymisation des candidatures refusées après 24 mois."
  );

  pdf.drawSectionTitle("Références métier", { numbered: false });
  pdf.drawParagraph(
    "Date: 15/06/2026 — Client: WebSolutions SARL — Poste: Stage développement full-stack — Type: Rapport de stage PFE."
  );

  pdf.drawSignatureBlock([
    "Fait à Tunis, le 15 juin 2025",
    "Signature stagiaire : ___________________________",
    "Signature encadrant : ___________________________",
  ]);

  return pdf.toBuffer();
}

async function buildFacturePdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "Attijari bank · Services Entreprises · Démo DMS",
  });

  pdf.drawBrandHeader({
    eyebrow: "Attijari bank",
    title: "FACTURE",
    subtitle: "N° FAC-2026-0847",
    badge: "TTC",
    meta: [
      { label: "Émission", value: "15/04/2026" },
      { label: "Échéance", value: "15/06/2026" },
      { label: "Client", value: "WebSolutions SARL" },
    ],
  });

  pdf.drawParagraph("Fournisseur: Attijari Bank — 25 Avenue Habib Bourguiba, Tunis 1000 — MF : 1234567/A/M/000", {
    size: 9,
    muted: true,
  });
  pdf.drawParagraph("Client: WebSolutions SARL — 14 Rue de la Bourse, Tunis — Contact : karim@websolutions.tn", {
    size: 9,
    muted: true,
  });

  pdf.drawDivider();

  pdf.drawTable(
    ["Désignation", "Qté", "P.U. HT", "Total HT"],
    [
      ["Pack compte professionnel Premium (mars 2025)", "1", "1 800,000", "1 800,000"],
      ["Cartes corporate", "5", "90,000", "450,000"],
      ["Frais de tenue de compte", "1", "120,000", "120,000"],
      ["Virements SEPA illimités", "1", "80,000", "80,000"],
    ],
    { colWidths: [255, 40, 85, 85] }
  );

  pdf.drawTotals([
    { label: "Montant HT", value: "2 450,000 TND" },
    { label: "TVA 19 %", value: "465,500 TND" },
    { label: "Total TTC", value: "2 915,500 TND" },
  ]);

  pdf.drawParagraph("Montant TTC: 2915.50 TND — N° document: FAC-2026-0847 — Échéance: 15/06/2026 — Date: 15/04/2026", {
    size: 9,
  });
  pdf.drawParagraph("Mode de règlement : prélèvement bancaire — IBAN TN59 1234 5678 9012 3456 7890 — Réf. WS-ATT-2026-Q2", {
    size: 9,
  });
  pdf.drawParagraph("Document généré automatiquement — démonstration DMS Workspace.", {
    size: 8,
    muted: true,
  });

  return pdf.toBuffer();
}

async function buildCandidaturePdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "Recrutement · WebSolutions · Workflow candidature",
  });

  pdf.drawBrandHeader({
    eyebrow: "Dossier RH",
    title: "Dossier de candidature",
    subtitle: "Stage développement full-stack",
    badge: "PRIORITÉ",
    meta: [
      { label: "Candidat", value: "Jean Dupont" },
      { label: "Formation", value: "Master Info — ISAMM" },
      { label: "Disponibilité", value: "Fév. 2025 · 6 mois" },
    ],
  });

  pdf.drawTagRow(["React", "TypeScript", "Node.js", "PostgreSQL", "Git"]);

  pdf.drawSectionTitle("Profil");
  pdf.drawParagraph(
    "Candidat: Jean Dupont — Poste: Stage développement full-stack — jean.dupont@email.fr · +33 6 12 34 56 78"
  );
  pdf.drawParagraph(
    "Motivé par les solutions documentaires et l'innovation produit. Formation Master Info — ISAMM."
  );

  pdf.drawSectionTitle("Compétences techniques");
  pdf.drawBulletList([
    "Frontend : React, TypeScript, Tailwind, composants accessibles.",
    "Backend : Node.js, Express, API REST, authentification JWT.",
    "Data : PostgreSQL, modélisation, recherche full-text.",
    "Outils : Git, Docker, méthodes agiles, revues de code.",
  ]);

  pdf.drawSectionTitle("Expériences");
  pdf.drawBulletList([
    "Projet PFE : plateforme DMS avec workflows et recherche IA.",
    "Stage été 2024 : développement frontend chez une ESN tunisienne.",
  ]);

  pdf.drawSectionTitle("Motivation");
  pdf.drawParagraph(
    "Je souhaite rejoindre WebSolutions pour contribuer à des solutions documentaires innovantes, approfondir mes compétences en équipe agile et participer à des projets à fort impact métier."
  );

  pdf.drawParagraph("Document généré pour démo workflow « Candidature — Validation complète ».", {
    size: 8,
    muted: true,
  });

  return pdf.toBuffer();
}

async function buildLettrePdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "Candidature · WebSolutions",
  });

  pdf.drawBrandHeader({
    eyebrow: "Lettre de motivation",
    title: "Syrine Mabrouk",
    subtitle: "Candidature — Stage développement full-stack",
    badge: "2026",
  });

  pdf.drawParagraph("Poste: Stage développement full-stack — Date: 10/04/2026", { size: 9, muted: true });

  pdf.drawParagraph("12 Avenue Mohamed V, 1002 Tunis", { size: 9, muted: true });
  pdf.drawParagraph("syrine.mabrouk@email.tn · +216 98 123 456", { size: 9, muted: true });

  pdf.drawDivider();

  pdf.drawParagraph("Madame, Monsieur,", { size: 11 });
  pdf.drawParagraph(
    "Actuellement en dernière année à l'ISAMM, je souhaite intégrer WebSolutions dans le cadre d'un stage de fin d'études en développement web. Votre expertise en solutions documentaires et votre culture d'innovation m'ont motivée à vous soumettre ma candidature."
  );
  pdf.drawParagraph(
    "Au cours de mes projets académiques, j'ai développé des applications React et Node.js avec authentification, API REST et bases PostgreSQL. Je suis autonome, rigoureuse et désireuse d'apprendre les bonnes pratiques en équipe."
  );
  pdf.drawParagraph(
    "Disponible dès février 2025, je serais honorée de vous rencontrer pour échanger sur ma motivation et mes compétences."
  );
  pdf.drawParagraph(
    "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées."
  );

  pdf.drawSignatureBlock(["Syrine Mabrouk"]);

  return pdf.toBuffer();
}

async function buildDevisPdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "TELNET TELECOM · Devis commercial",
  });

  pdf.drawBrandHeader({
    eyebrow: "TELNET TELECOM",
    title: "Devis commercial",
    subtitle: "N° DEV-2026-0312",
    badge: "30 JOURS",
    meta: [
      { label: "Client", value: "WebSolutions SARL" },
      { label: "Contact", value: "Karim Ben Salah" },
      { label: "Date", value: "20/04/2026" },
    ],
  });

  pdf.drawTable(
    ["Prestation", "Durée", "Montant HT"],
    [
      ["Audit réseau local", "2 jours", "1 800 TND"],
      ["Déploiement firewall Fortinet", "—", "4 500 TND"],
      ["Migration serveur fichiers NAS", "—", "2 200 TND"],
      ["Formation administrateurs", "1 jour", "950 TND"],
      ["Support premium 12 mois", "—", "3 600 TND"],
    ],
    { colWidths: [280, 80, 95] }
  );

  pdf.drawTotals([
    { label: "Total HT", value: "13 050,000 TND" },
    { label: "Remise 10 %", value: "- 1 305,000 TND" },
    { label: "Net HT", value: "11 745,000 TND" },
    { label: "TVA 19 %", value: "2 231,550 TND" },
    { label: "Total TTC", value: "13 976,550 TND" },
  ]);

  pdf.drawParagraph(
    "Montant TTC: 13976.55 TND — N° document: DEV-2026-0312 — Client: WebSolutions SARL — Date: 20/04/2026 — Validité: 20/05/2026",
    { size: 9 }
  );

  pdf.drawBulletList([
    "Conditions : acompte 30 % à la commande, solde à la livraison.",
    "Délai d'intervention estimé : 4 semaines après validation.",
  ]);

  return pdf.toBuffer();
}

async function buildContratDocx() {
  return buildDocx([
    { text: "CONTRAT D'ALTERNANCE PROFESSIONNELLE", style: "Title" },
    { text: "Année universitaire 2025-2026 — Date: 28/08/2025", style: "Muted" },
    { text: "Client: WebSolutions SARL — Fournisseur: ISAMM", style: "Muted" },
    { text: "", style: "Normal" },
    { text: "Entre les soussignés", style: "Heading1" },
    {
      text: "WebSolutions SARL, 14 Rue de la Bourse, Tunis, représentée par M. Karim Ben Salah, d'une part,",
    },
    { text: "Et", style: "Muted" },
    {
      text: "M./Mme Aymen Neguez, né(e) le 12/08/2001, étudiant(e) à l'ISAMM, d'autre part,",
    },
    { text: "Il a été convenu ce qui suit :", style: "Heading2" },
    { text: "Article 1 — Objet", style: "Heading2" },
    {
      text: "Le présent contrat a pour objet l'accueil de l'alternant au sein du service Développement Logiciel pour participer au projet DMS Workspace.",
    },
    { text: "Article 2 — Durée", style: "Heading2" },
    {
      text: "Du 01/09/2025 au 31/08/2026, rythme alterné : 2 semaines école / 2 semaines entreprise.",
    },
    { text: "Article 3 — Missions", style: "Heading2" },
    {
      text: "Développement frontend et backend, tests, documentation technique, participation aux revues de code et intégration des modules IA.",
    },
    { text: "Article 4 — Rémunération", style: "Heading2" },
    { text: "Grille conventionnelle applicable : 65 % du SMIC les 1re et 2e années." },
    { text: "Article 5 — Confidentialité", style: "Heading2" },
    {
      text: "L'alternant s'engage à respecter la confidentialité des informations auxquelles il accède.",
    },
    { text: "Fait en triple exemplaire à Tunis, le 28/08/2025.", style: "Muted" },
    { text: "Signature employeur : ____________________    Signature alternant : ____________________" },
  ]);
}

async function buildFactureDuplicatePdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "Attijari bank · Facture dupliquée — test IA déduplication",
  });

  pdf.drawBrandHeader({
    eyebrow: "Attijari bank",
    title: "FACTURE",
    subtitle: "N° FAC-2026-0848",
    badge: "TTC",
    meta: [
      { label: "Émission", value: "16/04/2026" },
      { label: "Échéance", value: "16/06/2026" },
      { label: "Client", value: "WebSolutions SARL" },
    ],
  });

  pdf.drawParagraph("Fournisseur: Attijari Bank — Client: WebSolutions SARL — karim@websolutions.tn", {
    size: 9,
    muted: true,
  });

  pdf.drawTable(
    ["Désignation", "Qté", "P.U. HT", "Total HT"],
    [
      ["Pack compte professionnel Premium (avril 2026)", "1", "1 800,000", "1 800,000"],
      ["Cartes corporate", "5", "90,000", "450,000"],
      ["Frais de tenue de compte", "1", "120,000", "120,000"],
      ["Virements SEPA illimités", "1", "80,000", "80,000"],
    ],
    { colWidths: [255, 40, 85, 85] }
  );

  pdf.drawTotals([
    { label: "Montant HT", value: "2 450,000 TND" },
    { label: "TVA 19 %", value: "465,500 TND" },
    { label: "Total TTC", value: "2 915,500 TND" },
  ]);

  pdf.drawParagraph("Montant TTC: 2915.50 TND — N° document: FAC-2026-0848 — Échéance: 16/06/2026 — Date: 16/04/2026", {
    size: 9,
  });

  return pdf.toBuffer();
}

async function buildPolitiqueRgpdPdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "WebSolutions · Politique interne · Conformité",
  });

  pdf.drawBrandHeader({
    eyebrow: "Conformité & RGPD",
    title: "Politique de rétention des documents",
    subtitle: "Réf. POL-RGPD-2026-01",
    badge: "VIGUEUR",
    meta: [
      { label: "Version", value: "1.2" },
      { label: "Date", value: "01/01/2026" },
      { label: "DPO", value: "dpo@websolutions.tn" },
    ],
  });

  pdf.drawSectionTitle("1. Objet");
  pdf.drawParagraph(
    "Cette politique définit les durées de conservation, les bases légales et les mesures de sécurité applicables aux documents gérés dans le DMS Workspace (contrats, factures, candidatures, rapports)."
  );

  pdf.drawSectionTitle("2. Durées de rétention");
  pdf.drawBulletList([
    "Contrats et conventions : 5 ans après la fin de la relation contractuelle.",
    "Factures et pièces comptables : 10 ans (obligation fiscale).",
    "Candidatures RH : 24 mois pour les dossiers non retenus, puis anonymisation.",
    "Rapports internes : 3 ans, sauf valeur probatoire.",
  ]);

  pdf.drawSectionTitle("3. Droits des personnes");
  pdf.drawParagraph(
    "Toute personne concernée peut exercer ses droits d'accès, rectification, effacement et portabilité via dpo@websolutions.tn. Délai de réponse : 30 jours."
  );

  pdf.drawSectionTitle("4. Sécurité");
  pdf.drawBulletList([
    "Chiffrement des fichiers sensibles et journalisation des accès (audit logs).",
    "Minimisation des données personnelles dans les métadonnées indexées.",
    "Revue annuelle des partages et liens publics actifs.",
  ]);

  pdf.drawParagraph(
    "Client: WebSolutions SARL — Date: 01/01/2026 — Poste: DPO — Type: Politique conformité RGPD.",
    { size: 9, muted: true }
  );

  return pdf.toBuffer();
}

async function buildContratRisquePdf() {
  const pdf = await new ModernPdfBuilder().init({
    footerLabel: "WebSolutions · Contrat prestation — relecture juridique",
  });

  pdf.drawBrandHeader({
    eyebrow: "Contrat prestation IT",
    title: "CONTRAT DE PRESTATION",
    subtitle: "Fournisseur externe — Projet DMS",
    badge: "RISQUE",
    meta: [
      { label: "Client", value: "WebSolutions SARL" },
      { label: "Fournisseur", value: "TechPartner SARL" },
      { label: "Date", value: "01/03/2026" },
    ],
  });

  pdf.drawSectionTitle("Article 1 — Objet");
  pdf.drawParagraph(
    "Prestation d'intégration IA et workflows documentaires pour la plateforme DMS Workspace."
  );

  pdf.drawSectionTitle("Article 2 — Pénalités");
  pdf.drawParagraph(
    "En cas de retard de livraison, une pénalité de 2 % du montant TTC par semaine de retard sera appliquée sans plafond."
  );

  pdf.drawSectionTitle("Article 3 — Résiliation");
  pdf.drawParagraph(
    "Le client se réserve le droit de résiliation unilatérale immédiate en cas de manquement grave, sans indemnité due au prestataire."
  );

  pdf.drawSectionTitle("Article 4 — Non-concurrence");
  pdf.drawParagraph(
    "Le prestataire s'engage à une clause de non-concurrence de 24 mois sur le secteur DMS en Tunisie."
  );

  pdf.drawSectionTitle("Article 5 — Confidentialité");
  pdf.drawParagraph(
    "Obligation de confidentialité perpétuelle sur toutes les données, codes sources et documents clients."
  );

  pdf.drawParagraph(
    "Montant TTC: 45000.00 TND — N° document: CTR-2026-0091 — Échéance: 01/03/2026 — Client: WebSolutions SARL",
    { size: 9 }
  );
  pdf.drawParagraph("Document contractuel sans signature visible — brouillon en attente de validation juridique.", {
    size: 8,
    muted: true,
  });

  return pdf.toBuffer();
}

/** @type {Record<string, () => Promise<Buffer>>} */
const BUILDERS = {
  "Rapport_Stage_Sahar_Neguez.pdf": buildRapportStagePdf,
  "Facture_ATTIJARI_BANK.pdf": buildFacturePdf,
  "Facture_Duplicate_ATTIJARI.pdf": buildFactureDuplicatePdf,
  "Lettre_Motivation_Syrine.pdf": buildLettrePdf,
  "Dossier_Candidature_Dupont.pdf": buildCandidaturePdf,
  "Devis_Commercial_TELNET.pdf": buildDevisPdf,
  "Contrat_Alternance_2025.docx": buildContratDocx,
  "Politique_Retention_RGPD.pdf": buildPolitiqueRgpdPdf,
  "Contrat_Prestation_Risque.pdf": buildContratRisquePdf,
};

async function buildDemoFileBuffer(originalName) {
  const builder = BUILDERS[originalName];
  if (!builder) {
    throw new Error(`Aucun generateur pour ${originalName}`);
  }
  return builder();
}

module.exports = {
  buildDemoFileBuffer,
  buildModernTextPdf,
  buildDocx,
};
