const { query } = require("../../config/db");
const env = require("../../config/env");
const {
  callGeminiChat,
  callOpenAIChat,
} = require("./ai.provider");

const DEFAULT_DAILY_LIMIT = Number(env.ai?.dailyLimit || process.env.IA_DAILY_LIMIT || 300);
const IA_PROVIDER = String(env.ai?.provider || process.env.IA_PROVIDER || "gemini")
  .trim()
  .toLowerCase();
const DEFAULT_MODEL = String(
  env.ai?.defaultModel || process.env.IA_MODEL || "gemini-2.5-flash-lite",
).trim();
const OPENAI_KEY = String(
  env.ai?.openaiApiKey || process.env.OPENAI_API_KEY || "",
).trim();
const GEMINI_KEY = String(
  env.ai?.geminiApiKey || process.env.GEMINI_API_KEY || "",
).trim();

function hasAiCredentials() {
  return IA_PROVIDER === "gemini" ? Boolean(GEMINI_KEY) : Boolean(OPENAI_KEY);
}

if (!hasAiCredentials()) {
  // eslint-disable-next-line no-console
  console.error(
    `[AI] Clé manquante pour le provider "${IA_PROVIDER}" — routes /ai-studio en erreur 503.`,
  );
} else {
  // eslint-disable-next-line no-console
  console.log(
    `[AI] Provider ${IA_PROVIDER} activé (modèle économique: ${DEFAULT_MODEL}, quota/jour: ${DEFAULT_DAILY_LIMIT})`,
  );
}

function assertOpenAIKey() {
  if (!hasAiCredentials()) {
    const err = new Error(
      IA_PROVIDER === "gemini"
        ? "GEMINI_API_KEY requis. Ajoutez votre clé Google AI dans backend/.env."
        : "OPENAI_API_KEY requis. Ajoutez votre clé OpenAI dans backend/.env.",
    );
    err.statusCode = 503;
    throw err;
  }
}

function getAiProvider() {
  return IA_PROVIDER;
}
let schemaCache = null;
let schemaCachedAt = 0;

const COST_PER_1K = {
  "gpt-3.5-turbo": 0.001,
  "gpt-4": 0.03,
  "gpt-4o": 0.005,
  "gpt-4o-mini": 0.00015,
  "gpt-4.1-nano": 0.0001,
  "gemini-pro": 0.001,
  "gemini-2.0-flash-lite": 0.00002,
  "gemini-2.5-flash-lite": 0.00002,
  "gemini-2.0-flash": 0.00005,
};

/** Modèle chat effectif — toujours celui configuré dans IA_MODEL / .env */
function resolveChatModel(_requested) {
  return DEFAULT_MODEL;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function estimateCost(model, tokens) {
  const per1k = COST_PER_1K[model] ?? 0.001;
  return Number(((tokens / 1000) * per1k).toFixed(6));
}

function topKeywords(text, limit = 8) {
  const stop = new Set([
    "avec",
    "dans",
    "pour",
    "vous",
    "nous",
    "cette",
    "cela",
    "that",
    "this",
    "from",
    "your",
    "have",
    "will",
    "les",
    "des",
    "une",
    "the",
    "and",
    "est",
    "sur",
    "par",
    "aux",
    "du",
    "de",
    "la",
    "le",
    "un",
    "une",
    "et",
    "ou",
    "en",
    "to",
    "for",
    "are",
    "was",
    "were",
    "ce",
    "ces",
    "qui",
    "que",
    "quoi",
    "not",
    "pas",
  ]);
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function detectDocType(text) {
  const t = String(text || "").toLowerCase();
  if (
    /(motivation|candidature|stage|alternance|poste|recrutement|lettre de motivation)/i.test(
      t,
    )
  ) {
    return {
      category: "Lettre de motivation",
      tags: ["candidature", "stage", "recrutement", "motivation"],
    };
  }
  if (
    /(cv|curriculum vitae|compétences|competences|expérience|experience|formation)/i.test(
      t,
    )
  ) {
    return { category: "CV", tags: ["cv", "compétences", "expérience"] };
  }
  if (
    /(lettre de motivation|motivation letter|candidature|postuler|stage)/i.test(
      t,
    )
  ) {
    return {
      category: "Lettre de motivation",
      tags: ["candidature", "stage", "motivation"],
    };
  }
  if (/(rapport de stage|internship report|stage report)/i.test(t)) {
    return {
      category: "Rapport de stage",
      tags: ["informatique", "développement"],
    };
  }
  if (/(facture|invoice|tva|montant|échéance|payer|payment)/i.test(t)) {
    return { category: "Facture", tags: ["finance", "urgent"] };
  }
  if (/(contrat|contract|clause|signature|partie|obligation)/i.test(t)) {
    return { category: "Contrat", tags: ["legal", "signature"] };
  }
  if (/(rapport|report|analyse|synthèse|résultat|conclusion)/i.test(t)) {
    return { category: "Rapport", tags: ["analyse", "presentation"] };
  }
  if (/(procès[- ]verbal|pv|meeting|réunion|minutes)/i.test(t)) {
    return { category: "Compte-rendu", tags: ["meeting", "suivi"] };
  }
  return { category: "Général", tags: ["document"] };
}

function normalizeIntentText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUserContextFromPrompt(prompt) {
  const src = String(prompt || "").trim();
  if (!src) return "";

  // Bloc données CSV (batch) : nom:, email:, entreprise:, …
  if (/\bnom\s*:/i.test(src)) {
    const block = src.match(/nom\s*:[\s\S]*/i);
    if (block?.[0]) {
      const lines = block[0]
        .split(/\n/)
        .filter(
          (line) => !/^contexte\s*:\s*non renseigné\s*$/i.test(line.trim()),
        );
      const joined = lines.join("\n").trim();
      if (joined) return joined;
    }
  }

  const patterns = [
    /contexte\s*:\s*([\s\S]*)$/i,
    /context\s*:\s*([\s\S]*)$/i,
    /a partir de\s*:\s*([\s\S]*)$/i,
    /à partir de\s*:\s*([\s\S]*)$/i,
  ];
  for (const p of patterns) {
    const m = src.match(p);
    if (m && m[1]) {
      const ctx = m[1].trim();
      if (ctx && !/^non renseigné$/i.test(ctx)) return ctx;
    }
  }
  return src;
}

function readBatchVar(batchVars, key, fallback = "") {
  const v = batchVars?.[key];
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  if (!s || /^non renseigné$/i.test(s)) return fallback;
  return s;
}

function buildDemoClassify(userPrompt) {
  const m = userPrompt.match(/Texte:\s*([\s\S]*)$/i);
  const text = (m && m[1]) || userPrompt;
  const det = detectDocType(text);
  const kws = topKeywords(text, 6);
  const fields = {};
  const clientMatch = text.match(/client\s*[:\-]\s*([^\n,;.]+)/i);
  const projectMatch = text.match(/projet\s*[:\-]\s*([^\n,;.]+)/i);
  if (clientMatch) fields.client = clientMatch[1].trim();
  if (projectMatch) fields.project = projectMatch[1].trim();
  if (!fields.client && kws[0]) fields.client = kws[0];
  if (!fields.project && kws[1]) fields.project = kws[1];
  return JSON.stringify(
    {
      category: det.category,
      tags: [...new Set([...det.tags, ...kws.slice(0, 3)])],
      custom_fields: fields,
    },
    null,
    2,
  );
}

function buildDemoSummary(userPrompt) {
  const m = userPrompt.match(/Document:\s*([\s\S]*)$/i);
  const text = (m && m[1]) || userPrompt;
  const kws = topKeywords(text, 8);
  const det = detectDocType(text);
  const keyPoints = [
    `Type détecté: ${det.category}.`,
    ...(det.category === "Lettre de motivation"
      ? ["Ce document est une lettre de motivation."]
      : []),
    `Mots-clés dominants: ${kws.slice(0, 4).join(", ") || "non déterminés"}.`,
    `Le document semble orienté vers: ${det.tags.join(", ")}.`,
    "Des éléments actionnables ont été identifiés dans le contenu.",
  ].slice(0, 5);
  const actions = [
    "Vérifier les données chiffrées et dates clés avant validation.",
    "Confirmer les parties prenantes mentionnées (client/projet).",
    "Archiver ou lancer un workflow d’approbation selon le type de document.",
  ];
  const risks = [];
  if (/signature|clause|obligation|pénalité/i.test(text))
    risks.push("Présence potentielle de clauses contractuelles sensibles.");
  if (/échéance|deadline|urgent|retard/i.test(text))
    risks.push("Risque de retard lié à une échéance.");
  if (/montant|paiement|invoice|facture/i.test(text))
    risks.push(
      "Risque financier: vérifier montants et conditions de paiement.",
    );
  if (risks.length === 0)
    risks.push("Aucun risque majeur explicite détecté en mode démo.");
  return JSON.stringify({ key_points: keyPoints, actions, risks }, null, 2);
}

function buildDemoContratFromVars(batchVars, userPrompt) {
  const nom = readBatchVar(batchVars, "nom", "le salarié");
  const email = readBatchVar(batchVars, "email", "");
  const entreprise = readBatchVar(batchVars, "entreprise", "l'employeur");
  const poste = readBatchVar(batchVars, "poste", "à définir");
  const montant = readBatchVar(batchVars, "montant", "à définir");
  const contexte = readBatchVar(batchVars, "contexte", "");
  const today = new Date().toLocaleDateString("fr-FR");

  return [
    "CONTRAT DE TRAVAIL",
    `Réf. DMS-${Date.now().toString().slice(-6)} · ${today}`,
    "",
    "PARTIES",
    `Employeur : ${entreprise}`,
    `Salarié : ${nom}${email ? ` (${email})` : ""}`,
    "",
    "Article 1 — Objet et prise de poste",
    `Le salarié est engagé en qualité de ${poste}, dans le respect de la législation du travail en vigueur et des usages de l'entreprise.`,
    "",
    "Article 2 — Rémunération",
    `Rémunération annuelle brute indicative : ${montant} €, payable selon les échéances définies par la paie interne.`,
    "",
    "Article 3 — Missions principales",
    "- Participation aux projets confiés par la direction.",
    "- Respect des procédures qualité, sécurité et confidentialité.",
    "- Collaboration avec les équipes métier et techniques.",
    "",
    "Article 4 — Contexte particulier",
    contexte ||
      extractUserContextFromPrompt(userPrompt) ||
      "Conditions usuelles du secteur et du poste visé.",
    "",
    "Article 5 — Durée et clauses",
    "Contrat établi à titre de démonstration DMS. Les clauses définitives seront validées par les services juridiques.",
    "",
    "Fait pour servir et valoir ce que de droit.",
    "",
    "Signature employeur : ____________________",
    "Signature salarié : ____________________",
  ].join("\n");
}

function buildDemoDevisFromVars(batchVars) {
  const nom = readBatchVar(batchVars, "nom", "Client");
  const entreprise = readBatchVar(batchVars, "entreprise", "—");
  const montant = readBatchVar(batchVars, "montant", "—");
  const poste = readBatchVar(batchVars, "poste", "prestation");
  const today = new Date().toLocaleDateString("fr-FR");

  return [
    "DEVIS COMMERCIAL",
    `N° DEV-${Date.now().toString().slice(-5)} · Validité 30 jours · ${today}`,
    "",
    "CLIENT",
    `Nom : ${nom}`,
    `Société : ${entreprise}`,
    "",
    "PRESTATIONS PROPOSÉES",
    `1. ${poste} .................................... ${montant} € HT`,
    "2. Accompagnement et mise en service ........... Inclus",
    "3. Support post-livraison (30 jours) ........... Inclus",
    "",
    "CONDITIONS",
    "- Paiement : 30 % à la commande, solde à la livraison.",
    "- Délai indicatif : 2 à 4 semaines selon disponibilité.",
    "- Devis établi en mode démonstration DMS Workspace.",
    "",
    `Montant proposé : ${montant} € HT`,
    "TVA applicable selon réglementation en vigueur.",
  ].join("\n");
}

function buildDemoLettreFromVars(batchVars) {
  const nom = readBatchVar(batchVars, "nom", "Candidat");
  const entreprise = readBatchVar(batchVars, "entreprise", "votre entreprise");
  const poste = readBatchVar(batchVars, "poste", "le poste proposé");
  const contexte = readBatchVar(batchVars, "contexte", "");

  return [
    `LETTRE DE MOTIVATION — ${nom}`,
    `Objet : Candidature pour ${poste}`,
    "",
    "Madame, Monsieur,",
    "",
    `Je souhaite rejoindre ${entreprise} pour le poste de ${poste}. Mon parcours et ma motivation correspondent aux attentes exprimées dans votre offre.`,
    contexte ? `\n${contexte}` : "",
    "",
    "Au cours de mes expériences, j'ai développé une rigueur technique, un sens de l'organisation et une capacité à travailler en équipe sur des projets exigeants.",
    "",
    "Je reste à votre disposition pour un entretien et vous remercie pour l'attention portée à ma candidature.",
    "",
    "Cordialement,",
    nom,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDemoEmailProfessional(userPrompt, batchVars = null) {
  const prompt = String(userPrompt || "");
  const context = extractUserContextFromPrompt(prompt);
  const intentText = normalizeIntentText(context);
  const kws = topKeywords(context, 10);
  const det = detectDocType(context);

  let scenario = "generic";
  if (/(stage|alternance|candidature|postuler|cv|motivation)/i.test(intentText))
    scenario = "internship";
  else if (
    /(reunion|meeting|reporte|replanifie|decale|decalage|calendrier|annulation|annule)/i.test(
      intentText,
    )
  )
    scenario = "meeting_reschedule";
  else if (
    /(facture|invoice|impaye|relance|paiement|echeance)/i.test(intentText)
  )
    scenario = "payment_reminder";
  else if (/(merci|remerciement|gratitude|reconnaissance)/i.test(intentText))
    scenario = "thanks";
  else if (
    /(presentation|projet|dms|solution|plateforme|proposition)/i.test(
      intentText,
    )
  )
    scenario = "project_intro";

  let subject = "";
  const s1 = prompt.match(/sujet\s*[:\-]\s*([^\n]+)/i);
  if (s1 && s1[1]) {
    subject = s1[1].trim();
  } else if (scenario === "project_intro") {
    subject = "Présentation de projet DMS";
  } else if (scenario === "internship") {
    subject = "Candidature pour un stage";
  } else if (scenario === "meeting_reschedule") {
    subject = "Report de la réunion";
  } else if (scenario === "payment_reminder") {
    subject = "Relance - Facture impayée";
  } else if (scenario === "thanks") {
    subject = "Remerciements";
  } else if (det.category === "Facture") {
    subject = "Suivi de facturation";
  } else if (det.category === "Contrat") {
    subject = "Point de validation contractuelle";
  }
  if (!subject)
    subject = `À propos : ${context.slice(0, 80) || "votre demande"}`;

  let recipient = "Bonjour,";
  const batchNom = readBatchVar(batchVars, "nom", "");
  const r1 = prompt.match(/(?:destinataire|à|a)\s*[:\-]\s*([^\n,;.]+)/i);
  if (batchNom) recipient = `Bonjour ${batchNom},`;
  else if (r1 && r1[1]) recipient = `Bonjour ${r1[1].trim()},`;
  else {
    const nomLine = context.match(/^nom\s*:\s*(.+)$/im);
    if (nomLine?.[1] && !/^non renseigné$/i.test(nomLine[1].trim())) {
      recipient = `Bonjour ${nomLine[1].trim()},`;
    }
  }

  let signature = "Sahar Neguez";
  const sig = prompt.match(
    /(?:signature|signé par|signe par)\s*[:\-]\s*([^\n]+)/i,
  );
  if (sig && sig[1]) signature = sig[1].trim();

  let intro = `Je fais suite à votre demande concernant : "${context || "votre sujet"}".`;
  let bodyLines = [
    `- Point principal identifié : ${kws[0] || "votre demande"}`,
    `- Élément complémentaire : ${kws[1] || "analyse du besoin"}`,
    `- Action recommandée : ${kws[2] || "validation et suite opérationnelle"}`,
  ];
  let conclusion =
    "Je reste à votre disposition pour échanger davantage sur ce sujet.";
  let closing = "Cordialement,";

  if (scenario === "project_intro") {
    intro =
      "Je vous présente mon projet de Système de Gestion Documentaire Intelligent (DMS). Cette solution vise à améliorer la gestion, la traçabilité et la sécurité documentaire.";
    bodyLines = [
      "- Centralisation et organisation des documents",
      "- Workflows d'approbation avec suivi des étapes",
      "- Recherche avancée dans les contenus PDF/Word",
      "- Partage sécurisé interne/externe",
      "- Fonctions IA d'assistance et d'analyse",
    ];
    conclusion =
      "Je serais ravi(e) de vous présenter une démonstration personnalisée.";
  } else if (scenario === "internship") {
    intro =
      "Je me permets de vous adresser ma candidature pour un stage en développement web.";
    bodyLines = [
      "- Motivation forte pour contribuer à des projets concrets",
      "- Compétences techniques en front-end, back-end et API",
      "- Capacité d'apprentissage rapide et travail en équipe",
      `- Domaines d'intérêt : ${kws.slice(0, 3).join(", ") || "développement web, qualité logicielle, UX"}`,
    ];
    conclusion = "Je reste disponible pour un entretien à votre convenance.";
  } else if (scenario === "meeting_reschedule") {
    const dateHint = context.match(
      /\b(\d{1,2}\s*(?:janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre))\b/i,
    );
    intro =
      "La réunion initialement prévue est reportée pour des raisons d'organisation.";
    bodyLines = [
      `- Nouvelle date proposée : ${dateHint?.[1] || "à confirmer"}`,
      "- Merci de confirmer votre disponibilité",
      "- L'ordre du jour reste inchangé sauf retour contraire",
    ];
    conclusion = "Merci pour votre compréhension et votre retour.";
  } else if (scenario === "payment_reminder") {
    const client =
      context.match(/client\s+([a-z0-9_\- ]+)/i)?.[1]?.trim() || "concerné";
    intro = `Selon nos relevés, une facture reste impayée à ce jour (${client}).`;
    bodyLines = [
      "- Vérification du statut de paiement en cours",
      "- Merci de nous communiquer la date de règlement prévue",
      "- Les pièces justificatives peuvent être renvoyées sur demande",
    ];
    conclusion =
      "Nous vous remercions de bien vouloir régulariser la situation dans les meilleurs délais.";
    closing = "Bien cordialement,";
  } else if (scenario === "thanks") {
    intro =
      "Je tiens à vous remercier sincèrement pour votre aide sur le projet.";
    bodyLines = [
      "- Votre accompagnement a facilité l'avancement des travaux",
      "- Vos retours ont amélioré la qualité du livrable",
      "- Votre disponibilité a été particulièrement appréciée",
    ];
    conclusion = "Encore merci pour votre implication.";
  }

  return [
    `Objet : ${subject}`,
    "",
    recipient,
    "",
    intro,
    "",
    "Points clés",
    ...bodyLines.slice(0, 5).map((l) => (l.startsWith("-") ? l : `- ${l}`)),
    "",
    conclusion,
    "",
    closing,
    signature,
    "",
    "—",
    "Document généré par DMS Workspace (mode démonstration IA).",
  ].join("\n");
}

/** Mode démo — rapport / synthèse (ne doit pas réutiliser les scénarios « email candidature »). */
function buildDemoReportDocumentaire(userPrompt) {
  const prompt = String(userPrompt || "");
  const context = extractUserContextFromPrompt(prompt);
  const kws = topKeywords(context, 10);
  const det = detectDocType(context);
  const titre = context.trim().slice(0, 72) || "Synthèse du besoin";

  return [
    `RAPPORT SYNTHÉTIQUE`,
    titre,
    `Classification : ${det.category} · ${new Date().toLocaleDateString("fr-FR")}`,
    "",
    "1. Contexte et périmètre",
    `Le sujet à traiter est : ${context || "(non précisé)"}.`,
    `Tags associés : ${det.tags.join(", ") || "—"}.`,
    "",
    "2. Synthèse des éléments saillants",
    `- Thèmes dominants : ${kws.slice(0, 6).join(", ") || "à préciser avec davantage de contexte"}.`,
    "- Lecture métier : structurer objectifs, contraintes et livrables attendus.",
    "- Public cible : équipes opérationnelles et direction.",
    "",
    "3. Risques / points de vigilance",
    "- Vérifier complétude des données avant diffusion officielle.",
    "- Mentionner les hypothèses si le texte source reste partiel.",
    "- Anticiper les dépendances planning et ressources.",
    "",
    "4. Recommandations",
    "- Définir jalons et responsabilités (PFE / stage si applicable).",
    "- Documenter les décisions et mettre à jour après validation terrain.",
    "- Lancer un workflow d'approbation si le document est contractuel ou financier.",
    "",
    "5. Prochaines étapes",
    "- Enrichir le contexte (objectifs mesurables, périmètre, dates).",
    "- Valider avec le référent avant publication.",
    "- Archiver la version validée dans le DMS.",
  ].join("\n");
}

function buildDemoLinkedIn(userPrompt) {
  const context = extractUserContextFromPrompt(userPrompt);
  const kws = topKeywords(context, 8);
  const hook =
    context.trim().slice(0, 140) || "Partager une initiative utile et concrète";

  return [
    "POST LINKEDIN — Brouillon",
    "",
    hook,
    "",
    "Pourquoi c'est important",
    `- ${kws[0] || "Clarté"} : impact mesurable sur la productivité.`,
    `- ${kws[1] || "Collaboration"} : aligner les équipes autour d'un référentiel unique.`,
    "- Une approche pragmatique : prioriser la valeur pour les utilisateurs finaux.",
    "",
    "Appel à discussion",
    "Comment formalisez-vous ce type de sujet dans votre organisation ?",
    "",
    "#gestiondocumentaire #productivité #collaboration #innovation #DMS",
  ].join("\n");
}

function buildDemoNoteInterne(userPrompt) {
  const context = extractUserContextFromPrompt(userPrompt);
  const kws = topKeywords(context, 6);

  return [
    "NOTE INTERNE",
    `Réf. NOTE-${Date.now().toString().slice(-5)} · ${new Date().toLocaleString("fr-FR")}`,
    "",
    "Objet",
    context.trim().slice(0, 120) || "Information interne",
    "",
    "Décisions / actions",
    `- Suivi : ${kws[0] || "à préciser"}`,
    "- Échéance : à définir avec le responsable de service",
    "- Diffusion : équipes concernées uniquement",
    "",
    "Synthèse",
    `Points associés au contexte : ${kws.slice(0, 5).join(", ") || "—"}.`,
    "",
    "Prochaine revue",
    "Point d'étape prévu lors de la réunion hebdomadaire.",
  ].join("\n");
}

/** Clé UI (email|report|…) ou déduction depuis le nom du template en base */
function normalizeTemplateKind(templateKind, templateName) {
  const raw = String(templateKind || "")
    .trim()
    .toLowerCase();
  if (
    [
      "email",
      "report",
      "linkedin",
      "note",
      "contrat",
      "devis",
      "lettre",
    ].includes(raw)
  )
    return raw;
  const tn = String(templateName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (tn.includes("rapport") || tn.includes("resume")) return "report";
  if (tn.includes("linkedin")) return "linkedin";
  if (tn.includes("note interne")) return "note";
  if (tn.includes("email")) return "email";
  return "email";
}

function pickDemoGenerateOutputByKind(userPrompt, kind, batchVars = null) {
  switch (kind) {
    case "contrat":
      return batchVars
        ? buildDemoContratFromVars(batchVars, userPrompt)
        : buildDemoReportDocumentaire(userPrompt);
    case "devis":
      return batchVars
        ? buildDemoDevisFromVars(batchVars)
        : buildDemoReportDocumentaire(userPrompt);
    case "lettre":
      return batchVars
        ? buildDemoLettreFromVars(batchVars)
        : buildDemoEmailProfessional(userPrompt, batchVars);
    case "report":
      return buildDemoReportDocumentaire(userPrompt);
    case "linkedin":
      return buildDemoLinkedIn(userPrompt);
    case "note":
      return buildDemoNoteInterne(userPrompt);
    case "email":
    default:
      return buildDemoEmailProfessional(userPrompt, batchVars);
  }
}

/** @deprecated utiliser normalizeTemplateKind + pickDemoGenerateOutputByKind */
function pickDemoGenerateOutput(userPrompt, templateName = "") {
  return pickDemoGenerateOutputByKind(
    userPrompt,
    normalizeTemplateKind("", templateName),
  );
}

/** Renforce le system prompt quand l’API OpenAI réelle est utilisée (AI Studio). */
function augmentSystemPromptForStudio(
  systemPrompt,
  templateKind,
  templateName,
) {
  const kind = normalizeTemplateKind(templateKind, templateName);
  const blocks = {
    report:
      "\n\n[Format obligatoire] Produis un RAPPORT ou une SYNTHÈSE structurée (sections numérotées). Interdit : courriel (pas de « Objet : », pas de « Bonjour, », pas de formule de mail).",
    linkedin:
      "\n\n[Format obligatoire] Post LinkedIn (accroche, corps court, hashtags en fin). Interdit : format email.",
    note: "\n\n[Format obligatoire] Note interne / mémo (titres courts, puces, décisions). Interdit : format email.",
    email: "",
  };
  return String(systemPrompt || "") + (blocks[kind] || "");
}

function looksLikeDocumentSummaryPrompt(text) {
  const up = String(text || "");
  return (
    /"key_points"\s*:\s*\[/i.test(up) ||
    (/Document:\s*/i.test(up) && /key_points/i.test(up)) ||
    /résume le document suivant|resume le document suivant/i.test(up)
  );
}

function logSql(sql, params) {
  // eslint-disable-next-line no-console
  console.log("[AI] SQL:", sql);
  // eslint-disable-next-line no-console
  console.log("[AI] Params:", params);
}

async function getTableColumns(tableName) {
  const sql = `SELECT column_name
               FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = ?`;
  const params = [tableName];
  logSql(sql, params);
  const rows = await query(sql, params);
  return new Set(
    rows.rows.map((r) =>
      String(r.column_name || "")
        .toLowerCase()
        .trim(),
    ),
  );
}

async function getSchema() {
  const now = Date.now();
  if (schemaCache && now - schemaCachedAt < 30000) return schemaCache;
  const [genCols, usageCols, quotaCols] = await Promise.all([
    getTableColumns("ai_generations"),
    getTableColumns("ai_usages"),
    getTableColumns("ai_quotas"),
  ]);
  schemaCache = { genCols, usageCols, quotaCols };
  schemaCachedAt = now;
  return schemaCache;
}

async function ensureQuota(userId) {
  let quotaCols;
  try {
    ({ quotaCols } = await getSchema());
  } catch {
    // Fail-open: do not break core features if metadata lookup fails.
    return { dailyLimit: DEFAULT_DAILY_LIMIT, usedToday: 0 };
  }
  if (!quotaCols.has("user_id")) {
    // Fail-open with explicit warning to keep upload/AI usable.
    // eslint-disable-next-line no-console
    console.warn(
      "[AI] ai_quotas schema mismatch (user_id missing). Quota disabled temporarily.",
    );
    return { dailyLimit: 10_000_000, usedToday: 0 };
  }

  const sqlUpsert = `INSERT INTO ai_quotas (user_id, daily_limit, used_today, last_reset_date)
                     VALUES (?, ?, 0, CURRENT_DATE)
                     ON DUPLICATE KEY UPDATE user_id = user_id`;
  const pUpsert = [userId, DEFAULT_DAILY_LIMIT];
  logSql(sqlUpsert, pUpsert);
  await query(sqlUpsert, pUpsert);

  const sqlReset = `UPDATE ai_quotas
                    SET used_today = IF(last_reset_date = CURRENT_DATE, used_today, 0),
                        last_reset_date = IF(last_reset_date = CURRENT_DATE, last_reset_date, CURRENT_DATE),
                        daily_limit = IF(daily_limit IS NULL OR daily_limit <= 0, ?, daily_limit)
                    WHERE user_id = ?`;
  const pReset = [DEFAULT_DAILY_LIMIT, userId];
  logSql(sqlReset, pReset);
  await query(sqlReset, pReset);

  const sqlSelect =
    "SELECT daily_limit, used_today FROM ai_quotas WHERE user_id = ?";
  const pSelect = [userId];
  logSql(sqlSelect, pSelect);
  let q;
  try {
    q = await query(sqlSelect, pSelect);
  } catch {
    return { dailyLimit: DEFAULT_DAILY_LIMIT, usedToday: 0 };
  }
  return {
    dailyLimit: Number(q.rows[0]?.daily_limit || DEFAULT_DAILY_LIMIT),
    usedToday: Number(q.rows[0]?.used_today || 0),
  };
}

async function assertQuota(userId) {
  const quota = await ensureQuota(userId);
  if (quota.usedToday >= quota.dailyLimit) {
    const err = new Error("Quota IA journalier atteint");
    err.status = 429;
    throw err;
  }
  return quota;
}

function applyTemplate(templateText, vars) {
  let out = String(templateText || "");
  for (const [k, v] of Object.entries(vars || {})) {
    const value = String(v ?? "");
    // Supporte les deux formats: {{key}} et {key}
    out = out.replaceAll(`{{${k}}}`, value);
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), value);
  }
  return out;
}

async function callOpenAI({
  model,
  systemPrompt,
  userPrompt,
  templateName,
  templateKind,
  batchVars = null,
  batchPresetKind = null,
}) {
  const studioKind =
    templateName || templateKind
      ? normalizeTemplateKind(templateKind, templateName)
      : null;
  assertOpenAIKey();

  const systemEffective = studioKind
    ? augmentSystemPromptForStudio(systemPrompt, templateKind, templateName)
    : systemPrompt;

  const chosenModel = resolveChatModel(model);
  if (IA_PROVIDER === "gemini") {
    return callGeminiChat({
      apiKey: GEMINI_KEY,
      model: chosenModel,
      systemPrompt: systemEffective,
      userPrompt,
    });
  }
  return callOpenAIChat({
    apiKey: OPENAI_KEY,
    model: chosenModel,
    systemPrompt: systemEffective,
    userPrompt,
  });
}

async function recordGeneration({
  userId,
  documentId = null,
  templateId = null,
  action,
  inputText,
  outputText,
  model,
  tokensUsed,
}) {
  let genCols = new Set();
  let usageCols = new Set();
  try {
    ({ genCols, usageCols } = await getSchema());
  } catch {
    // fail-open
  }
  const cost = estimateCost(model, tokensUsed);
  const genData = {
    user_id: userId,
    document_id: documentId,
    template_id: templateId,
    action,
    input_text: inputText,
    output_text: outputText,
    model,
    tokens_used: tokensUsed,
    cost,
  };
  let generationId = null;
  const genKeys = Object.keys(genData).filter((k) => genCols.has(k));
  if (genKeys.length > 0) {
    const genSql = `INSERT INTO ai_generations (${genKeys.join(", ")}) VALUES (${genKeys.map(() => "?").join(", ")})`;
    const genParams = genKeys.map((k) => genData[k]);
    logSql(genSql, genParams);
    const ins = await query(genSql, genParams);
    generationId = ins.rows.insertId;
  }

  // Compatibilité schéma ai_usages: ancien (input_text/output_text/tokens_used) ou nouveau (model/tokens/cost/generation_id)
  const usageData = {
    user_id: userId,
    action,
    input_text: inputText,
    output_text: outputText,
    tokens_used: tokensUsed,
    model,
    tokens: tokensUsed,
    cost,
    generation_id: generationId,
  };
  const usageKeys = Object.keys(usageData).filter((k) => usageCols.has(k));
  if (usageKeys.length > 0) {
    const usageSql = `INSERT INTO ai_usages (${usageKeys.join(", ")}) VALUES (${usageKeys.map(() => "?").join(", ")})`;
    const usageParams = usageKeys.map((k) => usageData[k]);
    logSql(usageSql, usageParams);
    await query(usageSql, usageParams);
  }

  if (generationId != null) {
    const quotaSql =
      "UPDATE ai_quotas SET used_today = used_today + 1 WHERE user_id = ?";
    const quotaParams = [userId];
    logSql(quotaSql, quotaParams);
    await query(quotaSql, quotaParams).catch(() => {});
  }
  return { generationId: generationId || 0, cost };
}

async function getUsageAndQuota(userId) {
  const { usageCols } = await getSchema();
  const tokensExpr = usageCols.has("tokens")
    ? "COALESCE(SUM(tokens), 0)"
    : usageCols.has("tokens_used")
      ? "COALESCE(SUM(tokens_used), 0)"
      : "0";
  const sqlUsage = `SELECT COUNT(*) AS calls, ${tokensExpr} AS tokens
                    FROM ai_usages
                    WHERE user_id = ? AND DATE(created_at) = CURDATE()`;
  const paramsUsage = [userId];
  logSql(sqlUsage, paramsUsage);
  const usage = await query(sqlUsage, paramsUsage);
  const quota = await ensureQuota(userId);
  return {
    calls: Number(usage.rows[0]?.calls || 0),
    tokens: Number(usage.rows[0]?.tokens || 0),
    ...quota,
    defaultModel: DEFAULT_MODEL,
    availableModels: [DEFAULT_MODEL],
    provider: IA_PROVIDER,
  };
}

async function resetUserQuota(userId) {
  await ensureQuota(userId);
  await query(
    `UPDATE ai_quotas
     SET used_today = 0, last_reset_date = CURRENT_DATE
     WHERE user_id = ?`,
    [userId],
  );
  return getUsageAndQuota(userId);
}

async function clearUserAiHistory(userId) {
  await query(`DELETE FROM ai_usages WHERE user_id = ?`, [userId]);
  await query(`DELETE FROM ai_generations WHERE user_id = ?`, [userId]);
}

async function resetUserAiState(userId) {
  await clearUserAiHistory(userId);
  const quota = await resetUserQuota(userId);
  return quota;
}

async function ensureDefaultTemplates(userId) {
  const count = await query(
    "SELECT COUNT(*) AS c FROM ai_templates WHERE is_custom = 0",
  );
  if (Number(count.rows[0]?.c || 0) > 0) return;
  const defaults = [
    [
      "Email professionnel",
      "Email clair et poli",
      "Tu es un assistant de rédaction professionnel.",
      "Rédige un email en {{language}} avec un ton {{tone}} et longueur {{length}}.\nSujet: {{subject}}\nContexte: {{context}}",
    ],
    [
      "Rapport / Résumé documentaire",
      "Synthèse structurée",
      "Tu crées des rapports professionnels synthétiques.",
      "Crée un rapport en {{language}} (ton {{tone}}, longueur {{length}}) à partir de:\n{{context}}",
    ],
    [
      "Post LinkedIn",
      "Post engageant",
      "Tu es copywriter LinkedIn B2B.",
      "Rédige un post LinkedIn en {{language}} (ton {{tone}}, longueur {{length}}) sur:\n{{context}}",
    ],
    [
      "Note interne",
      "Communication interne",
      "Tu rédiges des notes internes claires et actionnables.",
      "Rédige une note interne en {{language}} (ton {{tone}}, longueur {{length}}) à partir de:\n{{context}}",
    ],
  ];
  for (const [name, description, sp, up] of defaults) {
    await query(
      `INSERT INTO ai_templates
       (name, description, system_prompt, user_prompt_template, language, tone, length, is_custom, created_by)
       VALUES (?, ?, ?, ?, 'FR', 'professionnel', 'moyen', 0, ?)`,
      [name, description, sp, up, userId],
    );
  }
}

module.exports = {
  DEFAULT_MODEL,
  IA_PROVIDER,
  getAiProvider,
  assertOpenAIKey,
  resolveChatModel,
  applyTemplate,
  callOpenAI,
  recordGeneration,
  ensureQuota,
  assertQuota,
  ensureDefaultTemplates,
  estimateTokens,
  getUsageAndQuota,
  resetUserQuota,
  clearUserAiHistory,
  resetUserAiState,
  getSchema,
  logSql,
};
