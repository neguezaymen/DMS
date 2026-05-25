const { query } = require("../../../config/db");
const { documentsVisibleSql } = require("../../documents/document-access.service");
const { detectDocType, tokenize } = require("../shared/documentNlp");

const PII_PATTERNS = [
  { type: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, label: "Adresse e-mail détectée" },
  { type: "phone", re: /(?:\+?\d{1,3}[\s.-]?)?(?:\d{2}[\s.-]?){4,5}\d/g, label: "Numéro de téléphone détecté" },
  { type: "iban", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, label: "IBAN / coordonnées bancaires" },
];

const RISK_CLAUSE_RE =
  /(pénalité|penalty|résiliation\s+unilatérale|arbitrage|indemnisation|clause\s+abusive|non-concurrence|confidentialité\s+perpétuelle)/gi;

const CONTRACT_REQUIRED_RE = /(contrat|contract|alternance|convention)/i;

function analyzeDocumentCompliance(doc) {
  const text = `${doc.title || ""}\n${doc.extracted_text || ""}\n${doc.description || ""}`;
  const lower = text.toLowerCase();
  const findings = [];
  let score = 100;

  for (const p of PII_PATTERNS) {
    const matches = text.match(p.re);
    if (matches && matches.length > 0) {
      findings.push({
        type: "rgpd",
        severity: "warning",
        code: p.type,
        message: `${p.label} (${matches.length} occurrence(s)) — vérifier la base légale et la minimisation des données.`,
      });
      score -= 8;
    }
  }

  const risks = text.match(RISK_CLAUSE_RE);
  if (risks) {
    const unique = [...new Set(risks.map((r) => r.toLowerCase()))];
    findings.push({
      type: "legal",
      severity: "high",
      code: "risky_clause",
      message: `Clause(s) sensible(s) : ${unique.slice(0, 4).join(", ")} — relecture juridique recommandée.`,
    });
    score -= 15;
  }

  if (CONTRACT_REQUIRED_RE.test(lower)) {
    if (!/(signature|signé|fait à|fait le)/i.test(text)) {
      findings.push({
        type: "completeness",
        severity: "warning",
        code: "missing_signature",
        message: "Document contractuel sans mention de signature ou de date de signature.",
      });
      score -= 10;
    }
    if (!/(date|durée|du\s+\d|au\s+\d|\d{2}\/\d{2}\/\d{4})/i.test(text)) {
      findings.push({
        type: "completeness",
        severity: "warning",
        code: "missing_dates",
        message: "Dates ou durée du contrat non clairement identifiées.",
      });
      score -= 8;
    }
  }

  if (/(facture|invoice|montant|ttc|ht)/i.test(lower)) {
    if (!/(montant|total|ttc|ht|\d+[.,]\d{2})/i.test(text)) {
      findings.push({
        type: "completeness",
        severity: "warning",
        code: "missing_amount",
        message: "Facture ou devis sans montant clairement identifiable.",
      });
      score -= 10;
    }
  }

  const dateMatch =
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (/(échéance|echeance|expire|expiration|validité)/i.test(lower) && dateMatch) {
    const raw = dateMatch[1];
    const normalized = raw.includes("/") ? raw.split("/").reverse().join("-") : raw;
    const dt = new Date(normalized);
    if (!Number.isNaN(dt.getTime()) && dt < new Date()) {
      findings.push({
        type: "expiry",
        severity: "high",
        code: "expired",
        message: `Échéance ou date de validité dépassée (${dt.toLocaleDateString("fr-FR")}).`,
      });
      score -= 20;
    }
  }

  if (!doc.category || String(doc.category).trim() === "" || doc.category === "Général") {
    findings.push({
      type: "taxonomy",
      severity: "info",
      code: "uncategorized",
      message: "Catégorie générique — classification documentaire à affiner.",
    });
    score -= 3;
  }

  const det = detectDocType(text);
  if (findings.length === 0) {
    findings.push({
      type: "ok",
      severity: "info",
      code: "clean",
      message: `Aucun risque majeur détecté. Type indicatif : ${det.category}.`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? "ok" : score >= 50 ? "warning" : "high";

  return {
    documentId: doc.id,
    title: doc.title,
    category: doc.category || det.category,
    score,
    level,
    findings,
  };
}

async function scanCorpusCompliance(user, { limit = 40 } = {}) {
  const vis = documentsVisibleSql(user, "d");
  const rows = await query(
    `SELECT d.id, d.title, d.category, d.description, d.extracted_text, d.status, d.created_at
     FROM documents d
     WHERE ${vis.sql}
       AND d.status NOT IN ('deleted', 'archived')
     ORDER BY d.updated_at DESC
     LIMIT ?`,
    [...vis.params, limit]
  );

  const reports = rows.rows.map((doc) => analyzeDocumentCompliance(doc));
  const summary = {
    scanned: reports.length,
    high: reports.filter((r) => r.level === "high").length,
    warning: reports.filter((r) => r.level === "warning").length,
    ok: reports.filter((r) => r.level === "ok").length,
    averageScore:
      reports.length > 0
        ? Math.round(reports.reduce((s, r) => s + r.score, 0) / reports.length)
        : 100,
  };

  return {
    summary,
    reports: reports.sort((a, b) => a.score - b.score),
  };
}

module.exports = {
  analyzeDocumentCompliance,
  scanCorpusCompliance,
};
