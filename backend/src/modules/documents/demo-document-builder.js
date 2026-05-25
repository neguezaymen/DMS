const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const archiver = require("archiver");
const { PassThrough } = require("stream");

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @typedef {{ text: string, size?: number, bold?: boolean, indent?: number, spacing?: number }} PdfLine */

/**
 * @param {PdfLine[]} lines
 * @returns {Promise<Buffer>}
 */
async function buildPdf(lines) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  const margin = 50;
  const bottom = 50;
  let y = 800;

  for (const line of lines) {
    const size = line.size || 11;
    const spacing = line.spacing ?? 1.35;
    const font = line.bold ? bold : regular;
    const x = margin + (line.indent || 0);

    if (y < bottom + size) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }

    page.drawText(line.text, {
      x,
      y,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size * spacing;
  }

  return Buffer.from(await doc.save());
}

/**
 * @param {string[]} paragraphs
 * @returns {Promise<Buffer>}
 */
function buildDocx(paragraphs) {
  const body = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`
    )
    .join("");

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

const RAPPORT_STAGE_LINES = [
  { text: "RAPPORT DE STAGE", size: 18, bold: true, spacing: 2 },
  { text: "Projet de Fin d'Etudes - Gestion documentaire (DMS)", size: 12, spacing: 1.8 },
  { text: "Stagiaire : Sahar Neguez", spacing: 1.6 },
  { text: "Encadrant entreprise : M. Karim Ben Salah", spacing: 1.6 },
  { text: "Ecole : ISAMM - Informatique", spacing: 1.6 },
  { text: "Periode : fevrier - juin 2025", spacing: 2.2 },
  { text: "1. Introduction", size: 13, bold: true, spacing: 1.8 },
  {
    text: "Ce rapport presente le travail realise au sein de WebSolutions SARL",
    spacing: 1.4,
  },
  {
    text: "dans le cadre du developpement d'une plateforme DMS (Document Management",
    spacing: 1.4,
  },
  {
    text: "System) destinee a centraliser, securiser et automatiser le cycle de vie",
    spacing: 1.4,
  },
  { text: "des documents administratifs et metiers.", spacing: 2 },
  { text: "2. Contexte et objectifs", size: 13, bold: true, spacing: 1.8 },
  {
    text: "L'entreprise souhaitait remplacer des echanges par e-mail par un depot",
    spacing: 1.4,
  },
  {
    text: "unique avec workflows de validation, recherche full-text et archivage.",
    spacing: 1.4,
  },
  {
    text: "Objectifs : upload securise, controle des acces, audit trail, tableaux de bord.",
    spacing: 2,
  },
  { text: "3. Missions realisees", size: 13, bold: true, spacing: 1.8 },
  { text: "- Analyse des besoins metiers et redaction du cahier des charges.", indent: 10, spacing: 1.4 },
  { text: "- Conception de l'architecture (React, Node.js, PostgreSQL/Neon).", indent: 10, spacing: 1.4 },
  { text: "- Implementation des modules documents, workflows et notifications.", indent: 10, spacing: 1.4 },
  { text: "- Integration IA : resume, classification et recherche semantique.", indent: 10, spacing: 1.4 },
  { text: "- Tests, documentation utilisateur et preparation de la soutenance.", indent: 10, spacing: 2 },
  { text: "4. Technologies utilisees", size: 13, bold: true, spacing: 1.8 },
  { text: "Frontend : React 19, TypeScript, Tailwind, shadcn/ui.", spacing: 1.4 },
  { text: "Backend : Express, Prisma, JWT, Resend, pgvector.", spacing: 1.4 },
  { text: "DevOps : Vite, Neon DB, deploiement conteneurise.", spacing: 2 },
  { text: "5. Conclusion", size: 13, bold: true, spacing: 1.8 },
  {
    text: "Ce stage a permis de mener un projet complet, de la conception a la mise",
    spacing: 1.4,
  },
  {
    text: "en production d'une solution DMS moderne. Les competences acquises en",
    spacing: 1.4,
  },
  {
    text: "architecture logicielle et gestion documentaire seront reutilisees en entreprise.",
    spacing: 2,
  },
  { text: "Fait a Tunis, le 15 juin 2025", spacing: 2 },
  { text: "Signature stagiaire : ____________________", spacing: 1.6 },
  { text: "Signature encadrant : ____________________", spacing: 1.6 },
];

const FACTURE_LINES = [
  { text: "Attijari bank - Services Entreprises", size: 16, bold: true, spacing: 2 },
  { text: "Siege : 25 Avenue Habib Bourguiba, Tunis 1000", spacing: 1.4 },
  { text: "MF : 1234567/A/M/000 - RIB : 0410 5044 4044 0123 4567 89", spacing: 2 },
  { text: "FACTURE N° FAC-2025-0847", size: 14, bold: true, spacing: 1.8 },
  { text: "Date d'emission : 12/03/2025", spacing: 1.4 },
  { text: "Date d'echeance : 12/04/2025", spacing: 1.4 },
  { text: "Client : WebSolutions SARL - 14 Rue de la Bourse, Tunis", spacing: 2 },
  { text: "Designation", bold: true, spacing: 1.6 },
  { text: "--------------------------------------------------------------", spacing: 1.2 },
  { text: "Pack compte professionnel Premium (mars 2025)", spacing: 1.4 },
  { text: "Cartes corporate x 5 unites", spacing: 1.4 },
  { text: "Frais de tenue de compte", spacing: 1.4 },
  { text: "Virements SEPA illimites", spacing: 2 },
  { text: "Montant HT ............................ 2 450,000 TND", spacing: 1.4 },
  { text: "TVA 19% ...............................   465,500 TND", spacing: 1.4 },
  { text: "Total TTC ............................. 2 915,500 TND", size: 12, bold: true, spacing: 2 },
  { text: "Mode de reglement : prelevement bancaire", spacing: 1.4 },
  { text: "Reference : WS-ATT-2025-Q1", spacing: 2 },
  { text: "Document genere automatiquement - demo DMS.", size: 9, spacing: 1.4 },
];

const CANDIDATURE_LINES = [
  { text: "DOSSIER DE CANDIDATURE", size: 16, bold: true, spacing: 2.2 },
  { text: "Poste : Stage developpement full-stack — WebSolutions", size: 11, bold: true, spacing: 2 },
  { text: "Candidat : Jean Dupont", size: 12, bold: true, spacing: 1.6 },
  { text: "Email : jean.dupont@email.fr — Tel : +33 6 12 34 56 78", spacing: 1.4 },
  { text: "Formation : Master Informatique — ISAMM", spacing: 1.4 },
  { text: "Disponibilite : fevrier 2025 — duree 6 mois", spacing: 2.2 },
  { text: "Competences techniques", size: 11, bold: true, spacing: 1.6 },
  { text: "React, TypeScript, Node.js, PostgreSQL, Git, REST API", spacing: 1.45 },
  { text: "Experiences", size: 11, bold: true, spacing: 1.6 },
  { text: "Projet PFE : plateforme DMS avec workflows et recherche IA.", spacing: 1.45 },
  { text: "Stage ete 2024 : developpement frontend chez une ESN tunisienne.", spacing: 2.2 },
  { text: "Motivation", size: 11, bold: true, spacing: 1.6 },
  {
    text: "Je souhaite rejoindre WebSolutions pour contribuer a des solutions",
    spacing: 1.45,
  },
  {
    text: "documentaires innovantes et approfondir mes competences en equipe agile.",
    spacing: 2.2,
  },
  { text: "Document genere pour demo workflow candidature — DMS.", size: 9, spacing: 1.4 },
];

const LETTRE_LINES = [
  { text: "Syrine Mabrouk", size: 12, bold: true, spacing: 1.6 },
  { text: "12 Avenue Mohamed V, 1002 Tunis", spacing: 1.4 },
  { text: "syrine.mabrouk@email.tn - +216 98 123 456", spacing: 2.2 },
  { text: "Objet : Candidature - Stage developpement full-stack", size: 11, bold: true, spacing: 2 },
  { text: "Madame, Monsieur,", spacing: 1.8 },
  {
    text: "Actuellement en derniere annee a l'ISAMM, je souhaite integrer WebSolutions",
    spacing: 1.45,
  },
  {
    text: "dans le cadre d'un stage de fin d'etudes en developpement web. Votre",
    spacing: 1.45,
  },
  {
    text: "expertise en solutions documentaires et votre culture d'innovation m'ont",
    spacing: 1.45,
  },
  {
    text: "motivee a vous soumettre ma candidature.",
    spacing: 1.8,
  },
  {
    text: "Au cours de mes projets academiques, j'ai developpe des applications React",
    spacing: 1.45,
  },
  {
    text: "et Node.js avec authentification, API REST et bases PostgreSQL. Je suis",
    spacing: 1.45,
  },
  {
    text: "autonome, rigoureuse et desireuse d'apprendre les bonnes pratiques en equipe.",
    spacing: 1.8,
  },
  {
    text: "Disponible des fevrier 2025, je serais honoree de vous rencontrer pour",
    spacing: 1.45,
  },
  {
    text: "echanger sur ma motivation et mes competences.",
    spacing: 2,
  },
  { text: "Je vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.", spacing: 2 },
  { text: "Syrine Mabrouk", spacing: 1.6 },
];

const DEVIS_LINES = [
  { text: "TELNET TELECOM", size: 18, bold: true, spacing: 2 },
  { text: "Solutions reseau & infrastructure - Tunis", spacing: 1.4 },
  { text: "Devis commercial N° DEV-2025-0312", size: 14, bold: true, spacing: 2 },
  { text: "Client : WebSolutions SARL", spacing: 1.4 },
  { text: "Contact : Karim Ben Salah - karim@websolutions.tn", spacing: 1.4 },
  { text: "Validite : 30 jours - Date : 20/03/2025", spacing: 2 },
  { text: "Prestations proposees", size: 12, bold: true, spacing: 1.6 },
  { text: "--------------------------------------------------------------", spacing: 1.2 },
  { text: "1. Audit reseau local (2 jours) ............... 1 800 TND HT", spacing: 1.4 },
  { text: "2. Deploiement firewall Fortinet .............. 4 500 TND HT", spacing: 1.4 },
  { text: "3. Migration serveur fichiers NAS .............. 2 200 TND HT", spacing: 1.4 },
  { text: "4. Formation administrateurs (1 jour) ..........   950 TND HT", spacing: 1.4 },
  { text: "5. Support premium 12 mois .................... 3 600 TND HT", spacing: 2 },
  { text: "Total HT .................................... 13 050,000 TND", spacing: 1.4 },
  { text: "Remise commerciale 10% ...................... - 1 305,000 TND", spacing: 1.4 },
  { text: "Net HT ...................................... 11 745,000 TND", spacing: 1.4 },
  { text: "TVA 19% ....................................... 2 231,550 TND", spacing: 1.4 },
  { text: "Total TTC ................................... 13 976,550 TND", size: 12, bold: true, spacing: 2 },
  { text: "Conditions : acompte 30% a la commande, solde a la livraison.", spacing: 1.4 },
  { text: "Delai d'intervention estime : 4 semaines apres validation.", spacing: 1.4 },
  { text: "Document de demonstration - DMS Workspace.", size: 9, spacing: 1.4 },
];

const CONTRAT_PARAGRAPHS = [
  "CONTRAT D'ALTERNANCE PROFESSIONNELLE",
  "Anne universitaire 2024-2025",
  "",
  "Entre les soussignes :",
  "WebSolutions SARL, 14 Rue de la Bourse, Tunis, representee par M. Karim Ben Salah,",
  "d'une part,",
  "Et",
  "M./Mme Aymen Neguez, ne(e) le 12/08/2001, etudiant(e) a l'ISAMM,",
  "d'autre part,",
  "",
  "Il a ete convenu ce qui suit :",
  "",
  "Article 1 - Objet",
  "Le present contrat a pour objet l'accueil de l'alternant au sein du service",
  "Developpement Logiciel pour participer au projet DMS Workspace.",
  "",
  "Article 2 - Duree",
  "Du 01/09/2024 au 31/08/2025, rythme alterne : 2 semaines ecole / 2 semaines entreprise.",
  "",
  "Article 3 - Missions",
  "Developpement frontend et backend, tests, documentation technique, participation aux revues de code.",
  "",
  "Article 4 - Remuneration",
  "Grille conventionnelle applicable : 65 % du SMIC les 1re et 2e annees.",
  "",
  "Article 5 - Confidentialite",
  "L'alternant s'engage a respecter la confidentialite des informations auxquelles il accede.",
  "",
  "Fait en triple exemplaire a Tunis, le 28/08/2024.",
  "",
  "Signature employeur : ____________________    Signature alternant : ____________________",
];

/** @type {Record<string, () => Promise<Buffer>>} */
const BUILDERS = {
  "Rapport_Stage_Sahar_Neguez.pdf": () => buildPdf(RAPPORT_STAGE_LINES),
  "Facture_ATTIJARI_BANK.pdf": () => buildPdf(FACTURE_LINES),
  "Lettre_Motivation_Syrine.pdf": () => buildPdf(LETTRE_LINES),
  "Dossier_Candidature_Dupont.pdf": () => buildPdf(CANDIDATURE_LINES),
  "Devis_Commercial_TELNET.pdf": () => buildPdf(DEVIS_LINES),
  "Contrat_Alternance_2025.docx": () => buildDocx(CONTRAT_PARAGRAPHS),
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
  buildPdf,
  buildDocx,
};
