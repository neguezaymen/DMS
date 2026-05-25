const { jaccard, tokenize, detectDocType } = require("../shared/documentNlp");

function scoreDocForQuestion(question, doc) {
  const qTokens = new Set(tokenize(question));
  const text = `${doc.title}\n${doc.extracted_text || ""}\n${doc.description || ""}`;
  const dTokens = tokenize(text);
  let overlap = 0;
  for (const t of dTokens) {
    if (qTokens.has(t)) overlap += 1;
  }
  const j = jaccard(question, text);
  const keywordBoost =
    /facture|contrat|candidat|rapport|devis|stage/i.test(question) &&
    detectDocType(text).category.toLowerCase().includes(String(question).toLowerCase().slice(0, 6))
      ? 0.15
      : 0;
  return Math.min(1, overlap / Math.max(qTokens.size, 1) * 0.6 + j * 0.5 + keywordBoost);
}

function pickExcerpt(text, question, maxLen = 220) {
  const src = String(text || "").replace(/\s+/g, " ").trim();
  if (!src) return "(contenu non indexé)";
  const qWords = tokenize(question).slice(0, 5);
  const lower = src.toLowerCase();
  for (const w of qWords) {
    const idx = lower.indexOf(w);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      return `${start > 0 ? "…" : ""}${src.slice(start, start + maxLen)}${start + maxLen < src.length ? "…" : ""}`;
    }
  }
  return `${src.slice(0, maxLen)}${src.length > maxLen ? "…" : ""}`;
}

function buildDemoCorpusAnswer(question, documents) {
  const scored = documents
    .map((d) => ({
      doc: d,
      relevance: scoreDocForQuestion(question, d),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  const top = scored.filter((s) => s.relevance >= 0.08).slice(0, 5);
  const used = top.length > 0 ? top : scored.slice(0, 3);

  const sources = used.map(({ doc, relevance }) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    relevance: Number((relevance * 100).toFixed(1)),
    excerpt: pickExcerpt(doc.extracted_text || doc.description, question),
  }));

  const q = question.toLowerCase();
  const lines = [`Réponse basée sur ${sources.length} document(s) du corpus :`, ""];

  if (/combien|nombre|liste|quels documents/i.test(q)) {
    lines.push(
      `Documents pertinents identifiés : ${sources.map((s) => `#${s.id} « ${s.title} »`).join(", ") || "aucun"}.`
    );
  } else if (/facture|montant|paiement|impay/i.test(q)) {
    const invoices = sources.filter((s) => /facture|invoice|montant/i.test(`${s.title} ${s.excerpt}`));
    lines.push(
      invoices.length
        ? `Factures / pièces financières repérées : ${invoices.map((s) => `#${s.id} ${s.title}`).join(" ; ")}.`
        : "Aucune facture clairement identifiée dans la sélection — élargir le corpus ou vérifier l'indexation."
    );
  } else if (/contrat|clause|signature|risk/i.test(q)) {
    lines.push(
      "Analyse contractuelle : privilégier une relecture des documents marqués « Contrat » et lancer un scan conformité."
    );
    sources.forEach((s) => lines.push(`- #${s.id} ${s.title} : ${s.excerpt}`));
  } else if (/candidat|recrut|rh|stage/i.test(q)) {
    lines.push("Dossiers RH / candidatures repérés dans le corpus :");
    sources.forEach((s) => lines.push(`- #${s.id} ${s.title} (${s.category || "—"})`));
  } else if (/expire|échéance|echeance|date/i.test(q)) {
    lines.push("Dates et échéances à vérifier dans les extraits suivants :");
    sources.forEach((s) => lines.push(`- #${s.id} : ${s.excerpt}`));
  } else {
    lines.push("Synthèse des éléments les plus proches de votre question :");
    sources.forEach((s) => {
      lines.push(`\n[#${s.id}] ${s.title}`);
      lines.push(`> ${s.excerpt}`);
    });
  }

  if (sources.length === 0) {
    lines.push("", "Aucun document de la sélection ne correspond suffisamment à la question.");
  } else {
    lines.push("", `Sources citées : ${sources.map((s) => `#${s.id}`).join(", ")}.`);
  }

  return {
    answer: lines.join("\n"),
    sources,
    mode: "demo-heuristic",
  };
}

module.exports = {
  buildDemoCorpusAnswer,
  scoreDocForQuestion,
  pickExcerpt,
};
