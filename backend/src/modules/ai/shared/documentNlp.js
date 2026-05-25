/** Utilitaires NLP légers partagés (classification heuristique, similarité). */

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function detectDocType(text) {
  const t = String(text || "").toLowerCase();
  if (/(motivation|candidature|stage|alternance|poste|recrutement|lettre de motivation|dossier de candidature)/i.test(t)) {
    return { category: "Candidature", tags: ["candidature", "RH", "recrutement"] };
  }
  if (/(cv|curriculum vitae|compétences|competences|expérience|experience|formation)/i.test(t)) {
    return { category: "Candidature", tags: ["cv", "candidature"] };
  }
  if (/(facture|invoice|tva|montant|échéance|payer|payment)/i.test(t)) {
    return { category: "Facture", tags: ["finance", "facture"] };
  }
  if (/(contrat|contract|clause|signature|partie|obligation|alternance)/i.test(t)) {
    return { category: "Contrat", tags: ["contrat", "legal"] };
  }
  if (/(rapport|report|analyse|synthèse|résultat|conclusion|stage)/i.test(t)) {
    return { category: "Rapport", tags: ["rapport", "analyse"] };
  }
  if (/(devis|commercial|proposition commerciale)/i.test(t)) {
    return { category: "Devis", tags: ["commercial", "devis"] };
  }
  if (/(rgpd|conformit[eé]|politique|retention|rétention|donn[eé]es personnelles)/i.test(t)) {
    return { category: "Conformité", tags: ["rgpd", "conformité", "politique"] };
  }
  if (/(lettre|correspondance)/i.test(t)) {
    return { category: "Lettre", tags: ["correspondance"] };
  }
  return { category: "Général", tags: ["document"] };
}

function jaccard(aText, bText) {
  const a = new Set(tokenize(aText));
  const b = new Set(tokenize(bText));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function mapToDocumentCategory(detectedCategory) {
  const c = String(detectedCategory || "").trim();
  const lower = c.toLowerCase();
  if (lower.includes("candidat") || lower.includes("cv")) return "Candidature";
  if (lower.includes("facture")) return "Facture";
  if (lower.includes("contrat")) return "Contrat";
  if (lower.includes("rapport")) return "Rapport";
  if (lower.includes("devis")) return "Devis";
  if (lower.includes("conformit") || lower.includes("rgpd") || lower.includes("politique")) return "Conformité";
  if (lower.includes("lettre")) return "Lettre";
  return c || "Général";
}

module.exports = {
  tokenize,
  detectDocType,
  jaccard,
  mapToDocumentCategory,
};
