const env = require("../../config/env");
const { query, pgQuery, isPgVectorEnabled, pgvector } = require("../../config/db");
const { isAdmin } = require("../../middlewares/auth");
const { toDocumentDto } = require("./documents.service");
const { documentsVisibleSql } = require("./document-access.service");
const { searchDocuments } = require("./search.service");

const EMBEDDING_DIM = 384;
const OPENAI_KEY = String(env.ai?.openaiApiKey || process.env.OPENAI_API_KEY || "").trim();

/** Cache : colonne MySQL embedding_json présente ? */
let mysqlEmbeddingColumnReady = null;

async function hasMysqlEmbeddingColumn() {
  if (mysqlEmbeddingColumnReady !== null) return mysqlEmbeddingColumnReady;
  try {
    const res = await query(
      `SELECT COUNT(1) AS c
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'documents'
         AND column_name = 'embedding_json'`
    );
    mysqlEmbeddingColumnReady = Number(res.rows[0]?.c) > 0;
  } catch {
    mysqlEmbeddingColumnReady = false;
  }
  return mysqlEmbeddingColumnReady;
}

/** Groupes sémantiques FR (repli sans OpenAI / pgvector) */
const SEMANTIC_GROUPS = [
  ["contrat", "accord", "embauche", "cdi", "cdd", "travail", "emploi", "convention", "avenant"],
  ["facture", "invoice", "paiement", "devis", "billing", "achat"],
  ["rapport", "report", "analyse", "synthèse", "bilan", "compte-rendu"],
  ["politique", "procédure", "règlement", "charte", "conformité", "rgpd"],
  ["budget", "finance", "trésorerie", "comptabilité", "fiscal"],
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function expandSemanticTokens(tokens) {
  const set = new Set(tokens);
  for (const token of tokens) {
    for (const group of SEMANTIC_GROUPS) {
      if (group.some((w) => w === token || token.includes(w) || w.includes(token))) {
        group.forEach((w) => set.add(w));
      }
    }
  }
  return [...set];
}

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

function fallbackEmbedding(text) {
  const tokens = expandSemanticTokens(tokenize(text));
  const vec = new Array(EMBEDDING_DIM).fill(0);
  if (tokens.length === 0) return vec;
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i += 1) h = (h * 31 + token.charCodeAt(i)) >>> 0;
    const idx = h % EMBEDDING_DIM;
    const sign = h % 2 === 0 ? 1 : -1;
    vec[idx] += sign * (1 + Math.min(token.length, 12) / 12);
    const idx2 = (h * 17) % EMBEDDING_DIM;
    vec[idx2] += sign * 0.35;
  }
  return l2Normalize(vec);
}

async function createEmbeddingFromOpenAI(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: String(text || "").slice(0, 8000),
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`OpenAI embeddings: ${r.status} ${errBody.slice(0, 200)}`);
  }
  const json = await r.json();
  const emb = json?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIM) {
    throw new Error("Invalid embedding response");
  }
  return l2Normalize(emb.map(Number));
}

async function createEmbeddingVector(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return fallbackEmbedding("");
  if (OPENAI_KEY) {
    try {
      return await createEmbeddingFromOpenAI(trimmed);
    } catch (err) {
      console.warn("[embedding] OpenAI fallback:", err.message);
    }
  }
  return fallbackEmbedding(trimmed);
}

function buildDocumentEmbeddingText(doc) {
  return [
    doc.title,
    doc.category,
    doc.tags,
    doc.description,
    doc.extracted_text,
    doc.original_name,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function storeEmbeddingMysql(documentId, vector) {
  if (!(await hasMysqlEmbeddingColumn())) return false;
  try {
    await query(
      `UPDATE documents SET embedding_json = ?, embedding_updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(vector), documentId]
    );
    return true;
  } catch (err) {
    console.warn(`[embedding] MySQL store skipped doc ${documentId}:`, err.message);
    return false;
  }
}

async function storeEmbeddingPg(documentId, vector) {
  if (!isPgVectorEnabled() || !pgvector) return false;
  try {
    const sqlVec = pgvector.toSql(vector);
    await pgQuery(
      `INSERT INTO document_embeddings (document_id, embedding, updated_at)
       VALUES ($1, $2::vector, NOW())
       ON CONFLICT (document_id)
       DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = NOW()`,
      [documentId, sqlVec]
    );
    return true;
  } catch (err) {
    console.warn(`[embedding] PG store skipped doc ${documentId}:`, err.message);
    return false;
  }
}

async function upsertDocumentEmbedding(documentId, vector) {
  await storeEmbeddingMysql(documentId, vector);
  await storeEmbeddingPg(documentId, vector);
}

async function fetchDocumentRow(documentId) {
  const res = await query(
    `SELECT d.*, u.full_name AS owner_name
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     WHERE d.id = ? AND d.status <> 'deleted'`,
    [documentId]
  );
  return res.rows[0] || null;
}

async function generateDocumentEmbedding(documentId) {
  const doc = await fetchDocumentRow(documentId);
  if (!doc) return { ok: false, reason: "NOT_FOUND" };
  const text = buildDocumentEmbeddingText(doc);
  const vector = await createEmbeddingVector(text);
  const mysqlOk = await storeEmbeddingMysql(documentId, vector);
  const pgOk = await storeEmbeddingPg(documentId, vector);
  return {
    ok: true,
    documentId,
    source: OPENAI_KEY ? "openai" : "local",
    stored: { mysql: mysqlOk, pg: pgOk },
  };
}

function queueDocumentEmbedding(documentId) {
  setImmediate(() => {
    generateDocumentEmbedding(documentId).catch((err) => {
      console.warn(`[embedding] async failed doc ${documentId}:`, err.message);
    });
  });
}

async function searchPgVector(queryVector, visibleIds, limit) {
  if (!isPgVectorEnabled() || !pgvector || visibleIds.length === 0) return null;
  try {
    const sqlVec = pgvector.toSql(queryVector);
    const placeholders = visibleIds.map((_, i) => `$${i + 2}`).join(",");
    const limitIdx = visibleIds.length + 2;
    const res = await pgQuery(
      `SELECT document_id, 1 - (embedding <=> $1::vector) AS score
       FROM document_embeddings
       WHERE document_id IN (${placeholders})
       ORDER BY embedding <=> $1::vector
       LIMIT $${limitIdx}`,
      [sqlVec, ...visibleIds, limit]
    );
    return res.rows.map((r) => ({
      documentId: Number(r.document_id),
      score: Number(r.score) || 0,
    }));
  } catch (err) {
    console.warn("[embedding] pgvector search skipped:", err.message);
    return null;
  }
}

async function searchMysqlEmbeddings(queryVector, scopeUser, limit) {
  if (!(await hasMysqlEmbeddingColumn())) return [];
  try {
    const vis = documentsVisibleSql(scopeUser);
    const res = await query(
      `SELECT d.id, d.embedding_json
       FROM documents d
       WHERE (${vis.sql}) AND d.status <> 'deleted' AND d.embedding_json IS NOT NULL`,
      vis.params
    );
    const scored = [];
    for (const row of res.rows) {
      let stored;
      try {
        stored =
          typeof row.embedding_json === "string" ? JSON.parse(row.embedding_json) : row.embedding_json;
      } catch {
        continue;
      }
      if (!Array.isArray(stored) || stored.length === 0) continue;
      scored.push({
        documentId: Number(row.id),
        score: cosineSimilarity(queryVector, stored),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } catch (err) {
    console.warn("[embedding] MySQL vector search skipped:", err.message);
    return [];
  }
}

async function searchClassicRanked(q, user, limit) {
  try {
    const result = await searchDocuments({
      q,
      scopeUser: isAdmin(user) ? null : user,
      page: 1,
      limit,
    });
    const hits = (result.data || []).filter((doc) => (Number(doc.searchScore) || 0) > 0);
    if (!hits.length) return [];
    const maxRel = Math.max(...hits.map((doc) => Number(doc.searchScore) || 0), 1);
    return hits.map((doc) => ({
      documentId: Number(doc.id),
      score: (Number(doc.searchScore) || 0) / maxRel,
    }));
  } catch (err) {
    console.warn("[embedding] classic ranked search failed:", err.message);
    return [];
  }
}

function mergeRankedHits(vectorHits, classicHits, limit) {
  const merged = new Map();
  for (const hit of vectorHits) {
    merged.set(hit.documentId, {
      documentId: hit.documentId,
      score: hit.score * 0.6,
    });
  }
  for (const hit of classicHits) {
    const prev = merged.get(hit.documentId);
    const classicPart = hit.score * 0.4;
    if (prev) {
      merged.set(hit.documentId, {
        documentId: hit.documentId,
        score: prev.score + classicPart,
      });
    } else {
      merged.set(hit.documentId, { documentId: hit.documentId, score: classicPart });
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

async function searchClassicFallback({ q, user, limit }) {
  try {
    const result = await searchDocuments({
      q,
      scopeUser: isAdmin(user) ? null : user,
      page: 1,
      limit,
    });
    return {
      data: (result.data || []).map((doc) => ({ ...doc, vectorScore: null })),
      mode: "classic-fallback",
      scores: [],
      fallback: true,
    };
  } catch (err) {
    console.warn("[embedding] classic search fallback failed:", err.message);
    return { data: [], mode: "classic-fallback-error", scores: [], fallback: true };
  }
}

async function hydrateRankedDocuments(ranked) {
  if (!ranked.length) return [];
  const ids = ranked.map((r) => r.documentId);
  const docsRes = await query(
    `SELECT d.*, u.full_name AS owner_name
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     WHERE d.id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const byId = new Map(docsRes.rows.map((row) => [Number(row.id), toDocumentDto(row)]));
  return ranked
    .map((r) => {
      const doc = byId.get(r.documentId);
      if (!doc) return null;
      return { ...doc, vectorScore: Math.round(r.score * 1000) / 1000 };
    })
    .filter(Boolean);
}

/**
 * Recherche sémantique — ne lève jamais d'exception (soutenance / prod).
 * pgvector / JSON → fusion avec recherche textuelle pondérée (titre, catégorie, contenu).
 */
async function searchDocumentsVector({ q, user, limit = 15 }) {
  const queryText = String(q || "").trim();
  if (!queryText) {
    return { data: [], mode: "empty", scores: [], fallback: false };
  }

  const normalizedLimit = Math.min(30, Math.max(1, Number(limit) || 15));
  const fetchLimit = Math.min(50, normalizedLimit * 2);
  const MIN_VECTOR_SCORE = 0.15;

  let vectorRanked = [];
  let vectorMode = null;

  try {
    const queryVector = await createEmbeddingVector(queryText);
    const vis = documentsVisibleSql(user);
    const idRes = await query(
      `SELECT d.id FROM documents d WHERE (${vis.sql}) AND d.status <> 'deleted'`,
      vis.params
    );
    const visibleIds = idRes.rows.map((r) => Number(r.id));

    const pgHits = await searchPgVector(queryVector, visibleIds, fetchLimit);
    if (pgHits?.length) {
      vectorRanked = pgHits.filter((h) => h.score >= MIN_VECTOR_SCORE);
      if (vectorRanked.length) vectorMode = "pgvector";
    }

    if (!vectorRanked.length) {
      const mysqlHits = await searchMysqlEmbeddings(queryVector, user, fetchLimit);
      vectorRanked = mysqlHits.filter((h) => h.score >= MIN_VECTOR_SCORE);
      if (vectorRanked.length) {
        vectorMode = OPENAI_KEY ? "openai-embedding" : "local-embedding";
      }
    }
  } catch (err) {
    console.warn("[embedding] vector pipeline error:", err.message);
  }

  const classicRanked = await searchClassicRanked(queryText, user, fetchLimit);

  let ranked = [];
  let mode = "no-results";
  let fallback = false;

  if (vectorRanked.length && classicRanked.length) {
    ranked = mergeRankedHits(vectorRanked, classicRanked, normalizedLimit);
    mode = `${vectorMode}+hybrid`;
  } else if (vectorRanked.length) {
    ranked = vectorRanked.slice(0, normalizedLimit);
    mode = vectorMode || "vector";
  } else if (classicRanked.length) {
    ranked = classicRanked.slice(0, normalizedLimit);
    mode = "classic-relevance";
    fallback = true;
  } else {
    return { data: [], mode: "no-results", scores: [], fallback: true };
  }

  const data = await hydrateRankedDocuments(ranked);
  return {
    data,
    mode,
    scores: ranked.map((r) => ({ documentId: r.documentId, score: r.score })),
    fallback,
  };
}

module.exports = {
  EMBEDDING_DIM,
  createEmbeddingVector,
  generateDocumentEmbedding,
  queueDocumentEmbedding,
  searchDocumentsVector,
  searchClassicFallback,
  buildDocumentEmbeddingText,
  hasMysqlEmbeddingColumn,
};
