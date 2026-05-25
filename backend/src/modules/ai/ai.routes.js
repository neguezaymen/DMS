const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs/promises");
const { query } = require("../../config/db");
const { logAudit } = require("../audit/audit.service");
const {
  getDocumentWithAccess,
  assertMinAccess,
  documentsVisibleSql,
} = require("../documents/document-access.service");
const { isAdmin } = require("../../middlewares/auth");
const {
  DEFAULT_MODEL,
  applyTemplate,
  callOpenAI,
  recordGeneration,
  assertQuota,
  ensureQuota,
  ensureDefaultTemplates,
  getUsageAndQuota,
  getSchema,
  logSql,
  resetUserAiState,
} = require("./ai.service");
const {
  parseCsvBuffer,
  normalizeRows,
  generateBatchZip,
  BATCH_TEMPLATES,
} = require("./ai.batch.service");
const { tokenize, detectDocType, jaccard } = require("./shared/documentNlp");
const { buildAiResponse } = require("./ai.response");
const { runAiTask } = require("./ai.orchestrator");
const { suggestWorkflowFromText } = require("./capabilities/workflowSuggest");
const { analyzeUploadFile } = require("./capabilities/uploadInsights");
const { scanCorpusCompliance, analyzeDocumentCompliance } = require("./capabilities/complianceScan");
const { buildDemoCorpusAnswer } = require("./capabilities/corpusQa");
const {
  extractMetadataFields,
  enrichDocumentRecord,
  batchEnrichDocuments,
} = require("./capabilities/metadataEnrich");
const {
  listRoutingRecommendations,
  suggestRoutingForDocument,
} = require("./capabilities/workflowRouting");

const router = express.Router();
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.use((req, res, next) => {
  const started = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[AI][${req.method}] ${req.originalUrl}`, {
    userId: req.user?.id || null,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    // eslint-disable-next-line no-console
    console.log(`[AI][${req.method}] ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`, {
      success: payload?.success,
      keys: payload ? Object.keys(payload) : [],
    });
    return originalJson(payload);
  };
  next();
});

async function extractBufferText(file) {
  const mime = String(file.mimetype || "").toLowerCase();
  const name = String(file.originalname || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    const parsed = await pdfParse(file.buffer);
    return parsed.text || "";
  }
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("officedocument.wordprocessingml.document") ||
    name.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return parsed.value || "";
  }
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return file.buffer.toString("utf8");
  }
  return "";
}

async function extractFileText(filePath, mimeType, originalName) {
  try {
    const buffer = await fs.readFile(filePath);
    return await extractBufferText({
      buffer,
      mimetype: mimeType || "",
      originalname: originalName || "",
    });
  } catch {
    return "";
  }
}

router.get("/templates", async (req, res, next) => {
  try {
    await ensureDefaultTemplates(req.user.id);
    const rows = await query(
      `SELECT id, name, description, system_prompt, user_prompt_template, language, tone, length, is_custom, created_by, created_at
       FROM ai_templates
       WHERE is_custom = 0 OR created_by = ?
       ORDER BY is_custom ASC, created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (e) {
    return next(e);
  }
});

router.post("/templates", async (req, res, next) => {
  try {
    const { name, description, systemPrompt, userPromptTemplate, language, tone, length } = req.body || {};
    if (!name || !systemPrompt || !userPromptTemplate) {
      return res.status(400).json({ success: false, message: "name, systemPrompt et userPromptTemplate sont requis" });
    }
    const ins = await query(
      `INSERT INTO ai_templates
       (name, description, system_prompt, user_prompt_template, language, tone, length, is_custom, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        String(name),
        description ? String(description) : null,
        String(systemPrompt),
        String(userPromptTemplate),
        language ? String(language) : "FR",
        tone ? String(tone) : "professionnel",
        length ? String(length) : "moyen",
        req.user.id,
      ]
    );
    return res.status(201).json({ success: true, data: { id: ins.rows.insertId } });
  } catch (e) {
    return next(e);
  }
});

router.get("/generations", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT g.id, g.user_id, g.document_id, g.template_id, g.action, g.input_text, g.output_text,
              g.model, g.tokens_used, g.cost, g.created_at, t.name AS template_name
       FROM ai_generations g
       LEFT JOIN ai_templates t ON t.id = g.template_id
       WHERE g.user_id = ?
       ORDER BY g.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (e) {
    return next(e);
  }
});

router.get("/quota", async (req, res, next) => {
  try {
    const q = await getUsageAndQuota(req.user.id);
    return res.json(buildAiResponse(q, { action: "quota" }));
  } catch (e) {
    return next(e);
  }
});

router.post("/quota/reset", async (req, res, next) => {
  try {
    const quota = await resetUserAiState(req.user.id);
    await logAudit({
      actorId: req.user.id,
      action: "ai.quota_reset",
      entityType: "user",
      entityId: String(req.user.id),
      metadata: { usedToday: quota.usedToday },
      ipAddress: req.ip,
    });
    return res.json(buildAiResponse(quota, { action: "quota_reset" }));
  } catch (e) {
    return next(e);
  }
});

router.get("/hub", async (req, res, next) => {
  try {
    const quota = await getUsageAndQuota(req.user.id);
    return res.json(
      buildAiResponse(
        {
          quota,
          features: [
            { id: "generate", path: "/ai-studio", label: "Génération de contenu" },
            { id: "batch", path: "/ai-studio/batch", label: "Génération batch CSV" },
            { id: "search", path: "/documents", label: "Recherche intelligente" },
            { id: "assistant", path: "/documents", label: "Assistant document (fiche)" },
            { id: "compliance", path: "/ai/compliance", label: "Conformité & risques" },
            { id: "corpus-qa", path: "/ai/corpus-qa", label: "Q&R sur le corpus" },
            { id: "metadata", path: "/ai/metadata", label: "Extraction métadonnées" },
            { id: "routing", path: "/ai/workflow-routing", label: "Routage workflow" },
          ],
        },
        { action: "hub" }
      )
    );
  } catch (e) {
    return next(e);
  }
});

router.get("/admin/usage", async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ success: false, message: "Admin access required" });
    const { usageCols } = await getSchema();
    const tokensExpr = usageCols.has("tokens")
      ? "COALESCE(SUM(u.tokens), 0)"
      : usageCols.has("tokens_used")
        ? "COALESCE(SUM(u.tokens_used), 0)"
        : "0";
    const costExpr = usageCols.has("cost") ? "COALESCE(SUM(u.cost), 0)" : "0";
    const sql = `SELECT u.user_id, us.email, us.full_name,
                        ${tokensExpr} AS tokens,
                        ${costExpr} AS cost,
                        COUNT(*) AS calls
                 FROM ai_usages u
                 JOIN users us ON us.id = u.user_id
                 WHERE DATE(u.created_at) = CURDATE()
                 GROUP BY u.user_id, us.email, us.full_name
                 ORDER BY calls DESC`;
    logSql(sql, []);
    const rows = await query(sql);
    return res.json({ success: true, data: rows.rows });
  } catch (e) {
    return next(e);
  }
});

router.post("/generate", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const {
      templateId,
      context = "",
      language = "FR",
      tone = "professionnel",
      length = "moyen",
      model,
      vars = {},
      stream,
      templateKind,
    } = req.body || {};
    if (!templateId) return res.status(400).json({ success: false, message: "templateId requis" });

    const t = await query("SELECT * FROM ai_templates WHERE id = ? AND (is_custom = 0 OR created_by = ?)", [
      Number(templateId),
      req.user.id,
    ]);
    if (!t.rows.length) return res.status(404).json({ success: false, message: "Template introuvable" });
    const tpl = t.rows[0];
    const chosenModel = model || DEFAULT_MODEL;
    const systemPrompt = tpl.system_prompt;
    const userPrompt = applyTemplate(tpl.user_prompt_template, {
      language,
      tone,
      length,
      context,
      prompt: context,
      ...vars,
    });

    const out = await callOpenAI({
      model: chosenModel,
      systemPrompt,
      userPrompt,
      templateName: tpl.name,
      templateKind,
    });
    const rec = await recordGeneration({
      userId: req.user.id,
      templateId: Number(templateId),
      action: "generate",
      inputText: userPrompt,
      outputText: out.content,
      model: out.model,
      tokensUsed: out.tokensUsed,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.generate",
      entityType: "ai_generation",
      entityId: String(rec.generationId),
      metadata: { model: out.model, templateId: Number(templateId) },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const words = out.content.split(/\s+/);
      for (let i = 0; i < words.length; i += 1) {
        res.write(`data: ${JSON.stringify({ chunk: `${words[i]} ` })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, generationId: rec.generationId })}\n\n`);
      return res.end();
    }

    return res.json({
      success: true,
      data: {
        id: rec.generationId,
        output: out.content,
        model: out.model,
        tokensUsed: out.tokensUsed,
        cost: rec.cost,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/summarize/:documentId", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const documentId = Number(req.params.documentId);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) return res.status(403).json({ success: false, message: "Access denied" });

    const text = String(ctx.docRow.extracted_text || ctx.docRow.description || "").slice(0, 12000);
    if (!text.trim()) {
      return res.status(400).json({ success: false, message: "Aucun texte extractible disponible" });
    }
    const chosenModel = req.body?.model || DEFAULT_MODEL;
    const systemPrompt = "Tu es un assistant d'analyse documentaire. Réponds en JSON strict.";
    const userPrompt = `Résume le document suivant avec la structure JSON:
{"key_points": ["..."], "actions": ["..."], "risks": ["..."]}
Document:
${text}`;
    const out = await callOpenAI({ model: chosenModel, systemPrompt, userPrompt });
    const rec = await recordGeneration({
      userId: req.user.id,
      documentId,
      action: "summarize",
      inputText: text,
      outputText: out.content,
      model: out.model,
      tokensUsed: out.tokensUsed,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.summarize",
      entityType: "document",
      entityId: String(documentId),
      metadata: { generationId: rec.generationId, model: out.model },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { id: rec.generationId, output: out.content, model: out.model } });
  } catch (e) {
    return next(e);
  }
});

router.post("/classify", memUpload.single("file"), async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const { documentId, document_id: documentIdAlias, text = "", model } = req.body || {};
    const effectiveDocumentId = documentId != null ? documentId : documentIdAlias;
    let content = String(text || "");
    let targetDocumentId = null;
    if (effectiveDocumentId != null) {
      const ctx = await getDocumentWithAccess(req.user, Number(effectiveDocumentId));
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      if (!assertMinAccess(ctx.access, "view")) return res.status(403).json({ success: false, message: "Access denied" });
      targetDocumentId = Number(effectiveDocumentId);
      content = String(ctx.docRow.extracted_text || ctx.docRow.description || "").slice(0, 8000);
    } else if (req.file) {
      const extracted = await extractBufferText(req.file);
      content = String(extracted || "").slice(0, 8000);
    }
    if (!content.trim()) return res.status(400).json({ success: false, message: "Texte à classer requis" });

    const chosenModel = model || DEFAULT_MODEL;
    const systemPrompt = "Tu classifies des documents. Réponds en JSON strict.";
    const userPrompt = `Propose une classification JSON:
{"category":"...","tags":["..."],"custom_fields":{"client":"...","project":"..."}}
Texte:
${content}`;
    const out = await callOpenAI({ model: chosenModel, systemPrompt, userPrompt });
    const rec = await recordGeneration({
      userId: req.user.id,
      documentId: targetDocumentId,
      action: "classify",
      inputText: content,
      outputText: out.content,
      model: out.model,
      tokensUsed: out.tokensUsed,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.classify",
      entityType: targetDocumentId ? "document" : "ai_generation",
      entityId: String(targetDocumentId || rec.generationId),
      metadata: { generationId: rec.generationId, model: out.model },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { id: rec.generationId, output: out.content, model: out.model } });
  } catch (e) {
    return next(e);
  }
});

router.post("/document-chat/:documentId", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const documentId = Number(req.params.documentId);
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ success: false, message: "Question requise" });

    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) return res.status(403).json({ success: false, message: "Access denied" });

    const docText = String(ctx.docRow.extracted_text || ctx.docRow.description || "").slice(0, 15000);
    const hist = await query(
      `SELECT input_text, output_text
       FROM ai_generations
       WHERE user_id = ? AND document_id = ? AND action = 'chat'
       ORDER BY created_at DESC
       LIMIT 6`,
      [req.user.id, documentId]
    );
    const historyBlock = hist.rows
      .reverse()
      .map((h) => `Q: ${h.input_text}\nR: ${h.output_text}`)
      .join("\n\n");

    const systemPrompt =
      "Tu es un assistant documentaire expert. Réponds de façon utile, vérifiable et concise. Si l'information n'est pas présente, dis-le clairement.";
    const userPrompt = `Contexte document:
Titre: ${ctx.docRow.title}
Contenu:
${docText || "(vide)"}

Historique conversation:
${historyBlock || "(aucun)"}

Question utilisateur:
${question}`;
    const out = await callOpenAI({
      model: req.body?.model || DEFAULT_MODEL,
      systemPrompt,
      userPrompt,
    });
    const rec = await recordGeneration({
      userId: req.user.id,
      documentId,
      action: "chat",
      inputText: question,
      outputText: out.content,
      model: out.model,
      tokensUsed: out.tokensUsed,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.chat",
      entityType: "document",
      entityId: String(documentId),
      metadata: { generationId: rec.generationId, model: out.model },
      ipAddress: req.ip,
    });
    return res.json({
      success: true,
      data: {
        answer: out.content,
        generationId: rec.generationId,
        model: out.model,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/search-natural", async (req, res, next) => {
  try {
    // eslint-disable-next-line no-console
    console.log("[AI] search-natural body:", req.body);
    await assertQuota(req.user.id);
    const phrase = String(req.body?.phrase || "").trim();
    const question = String(phrase || req.body?.question || "").trim();
    if (!question) {
      return res.status(400).json({ success: false, error: "Phrase manquante", message: "Question requise" });
    }

    // Parse naturel simple + robuste (fallback déterministe)
    const ql = question.toLowerCase();
    const filters = { search: "", category: "", status: "", dateFrom: "", dateTo: "" };
    if (ql.includes("facture")) filters.category = "Facture";
    else if (ql.includes("contrat")) filters.category = "Contrat";
    else if (ql.includes("rapport")) filters.category = "Rapport";
    if (ql.includes("approuv")) filters.status = "approved";
    else if (ql.includes("en attente") || ql.includes("pending")) filters.status = "pending";
    else if (ql.includes("rejet")) filters.status = "rejected";
    else if (ql.includes("archiv")) filters.status = "archived";
    else if (ql.includes("actif")) filters.status = "active";
    if (ql.includes("mois dernier")) {
      filters.dateFrom = "LAST_MONTH_START";
      filters.dateTo = "LAST_MONTH_END";
    }
    const significant = question
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6)
      .join(" ");
    filters.search = significant;

    const sqlFilters = [];
    const params = [];
    if (!isAdmin(req.user)) {
      const vis = documentsVisibleSql(req.user);
      sqlFilters.push(`(${vis.sql})`);
      params.push(...vis.params);
    }
    if (filters.category) {
      sqlFilters.push("d.category LIKE ?");
      params.push(`%${filters.category}%`);
    }
    if (filters.status) {
      sqlFilters.push("d.status = ?");
      params.push(filters.status);
    }
    if (filters.search) {
      sqlFilters.push("(d.title LIKE ? OR d.description LIKE ? OR d.tags LIKE ? OR d.extracted_text LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.dateFrom === "LAST_MONTH_START") {
      sqlFilters.push("d.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')");
      sqlFilters.push("d.created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')");
    }
    const where = sqlFilters.length ? `WHERE ${sqlFilters.join(" AND ")}` : "";
    const rows = await query(
      `SELECT d.id, d.title, d.category, d.status, d.created_at, u.full_name AS owner_name
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT 50`,
      params
    );

    const rec = await recordGeneration({
      userId: req.user.id,
      action: "nl_search",
      inputText: question,
      outputText: JSON.stringify(filters),
      model: "heuristic+sql",
      tokensUsed: 1,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.search_natural",
      entityType: "ai_generation",
      entityId: String(rec.generationId),
      metadata: { filters, count: rows.rows.length },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      documents: rows.rows,
      total: rows.rows.length,
      resolvedFilters: filters,
      data: { filters, results: rows.rows },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[AI] search-natural error:", e);
    // eslint-disable-next-line no-console
    console.error("[AI] error stack:", e?.stack);
    return res.status(500).json({ success: false, error: e?.message || "Internal server error" });
  }
});

router.post("/deduplicate-upload-check", memUpload.single("file"), async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Fichier requis" });
    const candidateText = (await extractBufferText(file)).slice(0, 15000);
    if (!candidateText.trim()) {
      return res.json({
        success: true,
        data: { similar: [], note: "Texte non extractible pour ce type de fichier" },
      });
    }

    const pool = await query(
      `SELECT id, title, original_name, category, created_at, extracted_text
       FROM documents
       WHERE extracted_text IS NOT NULL AND extracted_text <> ''
       ORDER BY created_at DESC
       LIMIT 300`
    );
    const scored = pool.rows
      .map((d) => ({
        id: d.id,
        title: d.title,
        original_name: d.original_name,
        category: d.category,
        created_at: d.created_at,
        similarity: Number((jaccard(candidateText, String(d.extracted_text || "")) * 100).toFixed(1)),
      }))
      .filter((x) => x.similarity >= 55)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    const rec = await recordGeneration({
      userId: req.user.id,
      action: "deduplicate",
      inputText: file.originalname,
      outputText: JSON.stringify(scored),
      model: "jaccard",
      tokensUsed: 1,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.deduplicate_check",
      entityType: "ai_generation",
      entityId: String(rec.generationId),
      metadata: { filename: file.originalname, similarCount: scored.length },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { similar: scored } });
  } catch (e) {
    return next(e);
  }
});

router.post("/workflow-suggest-upload", memUpload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Fichier requis" });
    const payload = await runAiTask(req.user.id, {
      action: "workflow_suggest",
      run: async () => {
        const text = (await extractBufferText(file)).slice(0, 8000);
        const data = await suggestWorkflowFromText(`${file.originalname}\n${text}`);
        return { data, source: "heuristic", tokensUsed: 0 };
      },
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.post("/upload-insights", memUpload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Fichier requis" });
    const payload = await runAiTask(req.user.id, {
      action: "upload_insights",
      run: async () => {
        const data = await analyzeUploadFile({
          user: req.user,
          file,
          extractText: extractBufferText,
        });
        return { data, source: "heuristic", tokensUsed: 0 };
      },
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.upload_insights",
      entityType: "ai_generation",
      entityId: String(file.originalname),
      metadata: {
        category: payload.data?.detectedCategory,
        workflowId: payload.data?.suggestedWorkflow?.id || null,
      },
      ipAddress: req.ip,
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.post("/report-multi-docs", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const ids = Array.isArray(req.body?.documentIds)
      ? req.body.documentIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "documentIds requis" });
    }
    const unique = Array.from(new Set(ids)).slice(0, 20);
    const docs = [];
    for (const id of unique) {
      const ctx = await getDocumentWithAccess(req.user, id);
      if (ctx.error) continue;
      if (!assertMinAccess(ctx.access, "view")) continue;
      docs.push(ctx.docRow);
    }
    if (docs.length === 0) return res.status(403).json({ success: false, message: "Aucun document accessible" });

    const perDoc = docs.map((d) => {
      const text = String(d.extracted_text || d.description || "").slice(0, 5000);
      const det = detectDocType(`${d.title}\n${text}`);
      const bullets = tokenize(text).slice(0, 5);
      return {
        id: d.id,
        title: d.title,
        category: d.category || det.category,
        keyPoints: bullets.length ? bullets : det.tags,
      };
    });

    const intro = `Rapport IA multi-documents — ${new Date().toLocaleString("fr-FR")}\nDocuments analysés: ${perDoc.length}`;
    const body = perDoc
      .map(
        (d, i) =>
          `\n${i + 1}. ${d.title} (#${d.id})\n   Catégorie: ${d.category}\n   Points clés: ${d.keyPoints.join(", ")}`
      )
      .join("\n");
    const conclusion =
      "\nConclusion:\n- Vérifier les documents marqués sensibles.\n- Prioriser ceux liés aux catégories Contrat/Facture.\n- Lancer les workflows de validation recommandés.";
    const reportText = `${intro}\n${body}\n${conclusion}`;

    const rec = await recordGeneration({
      userId: req.user.id,
      action: "report_multi",
      inputText: JSON.stringify(unique),
      outputText: reportText,
      model: "demo-heuristic",
      tokensUsed: 1,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.report_multi_docs",
      entityType: "ai_generation",
      entityId: String(rec.generationId),
      metadata: { documentIds: unique, analyzed: perDoc.length },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { reportText, documents: perDoc, generationId: rec.generationId } });
  } catch (e) {
    return next(e);
  }
});

router.get("/alerts", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const alerts = [];

    // Expiring links
    const exp = await query(
      `SELECT pl.id, pl.document_id, pl.expires_at, d.title
       FROM public_links pl
       JOIN documents d ON d.id = pl.document_id
       WHERE pl.revoked = 0
         AND pl.expires_at IS NOT NULL
         AND pl.expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)
       ORDER BY pl.expires_at ASC
       LIMIT 20`
    );
    for (const r of exp.rows) {
      alerts.push({
        type: "expiry",
        severity: "warning",
        title: `Lien proche expiration: ${r.title}`,
        detail: `Expire le ${new Date(r.expires_at).toLocaleString("fr-FR")}`,
        link: `/documents/${r.document_id}`,
      });
    }

    // Risky clauses heuristic
    const risky = await query(
      `SELECT id, title, extracted_text
       FROM documents
       WHERE extracted_text IS NOT NULL AND extracted_text <> ''
       ORDER BY created_at DESC
       LIMIT 200`
    );
    for (const d of risky.rows) {
      const txt = String(d.extracted_text || "").toLowerCase();
      if (/(pénalité|penalty|résiliation|arbitrage|liability|indemnisation)/i.test(txt)) {
        alerts.push({
          type: "risk",
          severity: "high",
          title: `Clause potentiellement risquée détectée`,
          detail: `${d.title}`,
          link: `/documents/${d.id}`,
        });
      }
    }

    // Potential duplicates
    const recent = risky.rows.slice(0, 60);
    for (let i = 0; i < recent.length; i += 1) {
      for (let j = i + 1; j < recent.length; j += 1) {
        const a = recent[i];
        const b = recent[j];
        const sim = jaccard(String(a.extracted_text || "").slice(0, 4000), String(b.extracted_text || "").slice(0, 4000));
        if (sim >= 0.8) {
          alerts.push({
            type: "duplicate",
            severity: "warning",
            title: "Doublon potentiel détecté",
            detail: `${a.title} ↔ ${b.title} (${Math.round(sim * 100)}%)`,
            link: `/documents/${a.id}`,
          });
          if (alerts.length > 40) break;
        }
      }
      if (alerts.length > 40) break;
    }

    return res.json({ success: true, data: alerts.slice(0, 50) });
  } catch (e) {
    return next(e);
  }
});

router.get("/recommend-similar/:documentId", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const documentId = Number(req.params.documentId);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) return res.status(403).json({ success: false, message: "Access denied" });

    const baseText = String(ctx.docRow.extracted_text || ctx.docRow.description || "").slice(0, 15000);
    if (!baseText.trim()) {
      return res.json({ success: true, data: { documentId, similar: [], note: "Document source sans texte extractible" } });
    }

    const pool = await query(
      `SELECT id, title, original_name, category, created_at, extracted_text
       FROM documents
       WHERE id <> ?
         AND extracted_text IS NOT NULL
         AND extracted_text <> ''
       ORDER BY created_at DESC
       LIMIT 400`,
      [documentId]
    );
    const scored = pool.rows
      .map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        created_at: d.created_at,
        similarity: Number((jaccard(baseText, String(d.extracted_text || "")) * 100).toFixed(1)),
      }))
      .filter((x) => x.similarity >= 60)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);

    const rec = await recordGeneration({
      userId: req.user.id,
      documentId,
      action: "recommend_similar",
      inputText: String(documentId),
      outputText: JSON.stringify(scored),
      model: "jaccard",
      tokensUsed: 1,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.recommend_similar",
      entityType: "document",
      entityId: String(documentId),
      metadata: { count: scored.length, generationId: rec.generationId },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: { documentId, similar: scored, generationId: rec.generationId } });
  } catch (e) {
    return next(e);
  }
});

router.post("/multi-doc-qa", async (req, res, next) => {
  try {
    const payload = await runAiTask(req.user.id, {
      action: "corpus_qa",
      run: async () => {
        const ids = Array.isArray(req.body?.documentIds)
          ? req.body.documentIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
          : [];
        const question = String(req.body?.question || "").trim();
        if (!ids.length) {
          const err = new Error("documentIds requis");
          err.status = 400;
          throw err;
        }
        if (!question) {
          const err = new Error("Question requise");
          err.status = 400;
          throw err;
        }

        const unique = Array.from(new Set(ids)).slice(0, 12);
        const accessible = [];
        for (const id of unique) {
          const ctx = await getDocumentWithAccess(req.user, id);
          if (ctx.error) continue;
          if (!assertMinAccess(ctx.access, "view")) continue;
          accessible.push(ctx.docRow);
        }
        if (!accessible.length) {
          const err = new Error("Aucun document accessible");
          err.status = 403;
          throw err;
        }

        const demo = buildDemoCorpusAnswer(question, accessible);
        let answer = demo.answer;
        let model = "demo-heuristic";
        let tokensUsed = 0;

        try {
          const contextBlock = accessible
            .map((d) => {
              const txt = String(d.extracted_text || d.description || "").slice(0, 3000);
              return `#${d.id} ${d.title}\n${txt || "(vide)"}\n`;
            })
            .join("\n---\n");
          const out = await callOpenAI({
            model: req.body?.model || DEFAULT_MODEL,
            systemPrompt:
              "Tu es un assistant documentaire multi-documents. Réponds en français, cite les IDs des documents utilisés, et indique quand une info est absente.",
            userPrompt: `Question: ${question}\n\nCorpus:\n${contextBlock}`,
          });
          if (out.content && !String(out.model || "").includes("demo")) {
            answer = out.content;
            model = out.model;
            tokensUsed = out.tokensUsed;
          }
        } catch {
          /* keep demo answer */
        }

        await recordGeneration({
          userId: req.user.id,
          action: "multi_doc_qa",
          inputText: JSON.stringify({ question, documentIds: unique }),
          outputText: answer,
          model,
          tokensUsed,
        });

        return {
          data: {
            answer,
            sources: demo.sources,
            documentsUsed: accessible.map((d) => ({ id: d.id, title: d.title })),
          },
          model,
          tokensUsed,
          source: String(model).includes("demo") ? "demo" : "openai",
        };
      },
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.multi_doc_qa",
      entityType: "ai_generation",
      entityId: String(req.user.id),
      metadata: { documentIds: req.body?.documentIds },
      ipAddress: req.ip,
    });
    return res.json(payload);
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ success: false, message: e.message });
    if (e.status === 403) return res.status(403).json({ success: false, message: e.message });
    return next(e);
  }
});

router.post("/corpus-qa", async (req, res, next) => {
  try {
    const payload = await runAiTask(req.user.id, {
      action: "corpus_qa",
      run: async () => {
        const ids = Array.isArray(req.body?.documentIds)
          ? req.body.documentIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
          : [];
        const question = String(req.body?.question || "").trim();
        if (!ids.length) {
          const err = new Error("documentIds requis");
          err.status = 400;
          throw err;
        }
        if (!question) {
          const err = new Error("Question requise");
          err.status = 400;
          throw err;
        }
        const unique = Array.from(new Set(ids)).slice(0, 12);
        const accessible = [];
        for (const id of unique) {
          const ctx = await getDocumentWithAccess(req.user, id);
          if (ctx.error) continue;
          if (!assertMinAccess(ctx.access, "view")) continue;
          accessible.push(ctx.docRow);
        }
        if (!accessible.length) {
          const err = new Error("Aucun document accessible");
          err.status = 403;
          throw err;
        }
        const demo = buildDemoCorpusAnswer(question, accessible);
        return {
          data: {
            answer: demo.answer,
            sources: demo.sources,
            documentsUsed: accessible.map((d) => ({ id: d.id, title: d.title })),
          },
          source: "demo",
          tokensUsed: 0,
        };
      },
    });
    return res.json(payload);
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ success: false, message: e.message });
    if (e.status === 403) return res.status(403).json({ success: false, message: e.message });
    return next(e);
  }
});

router.get("/compliance/scan", async (req, res, next) => {
  try {
    const payload = await runAiTask(req.user.id, {
      action: "compliance_scan",
      run: async () => {
        const data = await scanCorpusCompliance(req.user, {
          limit: Math.min(60, Number(req.query.limit || 40)),
        });
        return { data, source: "heuristic", tokensUsed: 0 };
      },
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.get("/compliance/scan/:documentId", async (req, res, next) => {
  try {
    const documentId = Number(req.params.documentId);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const payload = await runAiTask(req.user.id, {
      action: "compliance_scan_doc",
      run: async () => ({
        data: analyzeDocumentCompliance(ctx.docRow),
        source: "heuristic",
        tokensUsed: 0,
      }),
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.post("/metadata/batch-enrich", async (req, res, next) => {
  try {
    const payload = await runAiTask(req.user.id, {
      action: "metadata_batch_enrich",
      run: async () => {
        const data = await batchEnrichDocuments(req.user, {
          documentIds: req.body?.documentIds,
          applyToCustomFields: Boolean(req.body?.applyToCustomFields),
          extractTextFn: extractFileText,
          limit: Math.min(30, Number(req.body?.limit || 20)),
        });
        return { data, source: "heuristic", tokensUsed: data.processed };
      },
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.metadata_batch_enrich",
      entityType: "ai_generation",
      entityId: String(req.user.id),
      metadata: { processed: payload.data?.processed },
      ipAddress: req.ip,
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.get("/workflow-routing/recommendations", async (req, res, next) => {
  try {
    const payload = await runAiTask(req.user.id, {
      action: "workflow_routing",
      run: async () => {
        const data = await listRoutingRecommendations(req.user, {
          limit: Math.min(30, Number(req.query.limit || 20)),
        });
        return { data, source: "heuristic", tokensUsed: 0 };
      },
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.get("/workflow-routing/suggest/:documentId", async (req, res, next) => {
  try {
    const documentId = Number(req.params.documentId);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const payload = await runAiTask(req.user.id, {
      action: "workflow_routing_doc",
      run: async () => ({
        data: await suggestRoutingForDocument(ctx.docRow),
        source: "heuristic",
        tokensUsed: 0,
      }),
    });
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
});

router.post("/extract-metadata/:documentId", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const documentId = Number(req.params.documentId);
    const applyToCustomFields = Boolean(req.body?.applyToCustomFields);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const canManage = assertMinAccess(ctx.access, "manage");
    const enriched = await enrichDocumentRecord(ctx.docRow, {
      applyToCustomFields: applyToCustomFields && canManage,
      canManage,
      extractTextFn: extractFileText,
    });
    const rec = await recordGeneration({
      userId: req.user.id,
      documentId,
      action: "extract_metadata",
      inputText: String(documentId),
      outputText: JSON.stringify(enriched),
      model: "regex+heuristic",
      tokensUsed: 1,
    });
    await logAudit({
      actorId: req.user.id,
      action: "ai.extract_metadata",
      entityType: "document",
      entityId: String(documentId),
      metadata: { mappedCount: enriched.mapped.length, generationId: rec.generationId },
      ipAddress: req.ip,
    });
    return res.json({
      success: true,
      data: {
        metadata: enriched.metadata,
        mapped: enriched.mapped,
        suggestedCategory: enriched.suggestedCategory,
        suggestedTags: enriched.suggestedTags,
        generationId: rec.generationId,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.get("/predictive-alerts", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const daysAhead = Math.min(90, Math.max(1, Number(req.query.daysAhead || 15)));
    const docs = await query(
      `SELECT d.id, d.title, d.extracted_text, d.description, d.category, d.owner_id
       FROM documents d
       ORDER BY d.updated_at DESC
       LIMIT 400`
    );
    const upcoming = [];
    const now = new Date();
    const horizon = new Date(now.getTime() + daysAhead * 86400000);
    for (const d of docs.rows) {
      if (!isAdmin(req.user) && Number(d.owner_id) !== Number(req.user.id)) continue;
      const text = `${d.title}\n${String(d.extracted_text || "").slice(0, 8000)}\n${String(d.description || "")}`;
      const m = extractMetadataFields(text);
      const candidate = m.echeance || m.date;
      if (!candidate) continue;
      const normalized = candidate.includes("/") ? candidate.split("/").reverse().join("-") : candidate;
      const dt = new Date(normalized);
      if (Number.isNaN(dt.getTime())) continue;
      if (dt >= now && dt <= horizon) {
        const days = Math.ceil((dt.getTime() - now.getTime()) / 86400000);
        upcoming.push({
          type: "deadline",
          severity: days <= 3 ? "high" : "warning",
          title: `Échéance proche (${days}j)`,
          detail: `${d.title} — ${dt.toLocaleDateString("fr-FR")}`,
          documentId: d.id,
          link: `/documents/${d.id}`,
        });
      }
    }
    return res.json({ success: true, data: { daysAhead, alerts: upcoming.slice(0, 80) } });
  } catch (e) {
    return next(e);
  }
});

router.post("/version-compare/:documentId", async (req, res, next) => {
  try {
    await assertQuota(req.user.id);
    const documentId = Number(req.params.documentId);
    const ctx = await getDocumentWithAccess(req.user, documentId);
    if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
    if (!assertMinAccess(ctx.access, "view")) return res.status(403).json({ success: false, message: "Access denied" });

    const versions = await query(
      `SELECT id, version_number, file_path, comment, created_at
       FROM document_versions
       WHERE document_id = ?
       ORDER BY version_number DESC`,
      [documentId]
    );
    const chosenA = Number(req.body?.versionAId || 0);
    const chosenB = Number(req.body?.versionBId || 0);
    let a = null;
    let b = null;
    if (chosenA && chosenB) {
      a = versions.rows.find((v) => Number(v.id) === chosenA) || null;
      b = versions.rows.find((v) => Number(v.id) === chosenB) || null;
    } else if (versions.rows.length >= 2) {
      a = versions.rows[1];
      b = versions.rows[0];
    } else {
      return res.status(400).json({ success: false, message: "Au moins 2 versions sont nécessaires" });
    }
    if (!a || !b) return res.status(400).json({ success: false, message: "Versions invalides" });

    const textA = await extractFileText(a.file_path, ctx.docRow.mime_type, ctx.docRow.original_name);
    const textB = await extractFileText(b.file_path, ctx.docRow.mime_type, ctx.docRow.original_name);
    const linesA = String(textA || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const linesB = String(textB || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const setA = new Set(linesA);
    const setB = new Set(linesB);
    const added = linesB.filter((l) => !setA.has(l)).slice(0, 30);
    const removed = linesA.filter((l) => !setB.has(l)).slice(0, 30);
    const amountsA = Array.from(String(textA || "").matchAll(/\b([0-9]+(?:[.,][0-9]{2})?)\s*(?:dt|tnd|eur|usd|€|\$)\b/gi)).map((m) => m[0]);
    const amountsB = Array.from(String(textB || "").matchAll(/\b([0-9]+(?:[.,][0-9]{2})?)\s*(?:dt|tnd|eur|usd|€|\$)\b/gi)).map((m) => m[0]);
    const summary =
      `Comparaison intelligente v${a.version_number} -> v${b.version_number}\n` +
      `- Lignes ajoutées: ${added.length}\n` +
      `- Lignes supprimées: ${removed.length}\n` +
      `- Montants détectés vA: ${amountsA.slice(0, 5).join(", ") || "aucun"}\n` +
      `- Montants détectés vB: ${amountsB.slice(0, 5).join(", ") || "aucun"}\n` +
      `- Clauses sensibles: ${
        /(pénalité|penalty|résiliation|arbitrage|liability|indemnisation)/i.test(String(textB || "")) ? "présentes" : "non détectées"
      }`;

    const rec = await recordGeneration({
      userId: req.user.id,
      documentId,
      action: "version_compare",
      inputText: JSON.stringify({ versionAId: a.id, versionBId: b.id }),
      outputText: summary,
      model: "diff+heuristic",
      tokensUsed: 1,
    });
    return res.json({
      success: true,
      data: {
        versionA: { id: a.id, versionNumber: a.version_number, createdAt: a.created_at },
        versionB: { id: b.id, versionNumber: b.version_number, createdAt: b.created_at },
        summary,
        addedLines: added,
        removedLines: removed,
        generationId: rec.generationId,
      },
    });
  } catch (e) {
    return next(e);
  }
});

/** Génération batch (CSV → N PDF → ZIP) */
router.post("/batch-generate", memUpload.single("file"), async (req, res, next) => {
  try {
    let rows = [];
    if (req.file?.buffer) {
      rows = parseCsvBuffer(req.file.buffer);
    } else if (req.body?.rows) {
      rows =
        typeof req.body.rows === "string" ? JSON.parse(req.body.rows) : normalizeRows(req.body.rows);
    }
    if (!rows.length) {
      return res.status(400).json({ success: false, message: "CSV ou rows JSON requis" });
    }

    const templateId = req.body?.templateId ? Number(req.body.templateId) : null;
    const templateKind = req.body?.templateKind || "contrat";
    const model = req.body?.model || DEFAULT_MODEL;

    const zipBuffer = await generateBatchZip({
      userId: req.user.id,
      rows,
      templateId,
      templateKind,
      model,
    });

    await logAudit({
      actorId: req.user.id,
      action: "ai.batch_generate",
      entityType: "ai_batch",
      metadata: { count: Math.min(rows.length, 25), templateKind },
      ipAddress: req.ip,
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dms-batch-${Date.now()}.zip"`
    );
    return res.send(zipBuffer);
  } catch (e) {
    if (e.status === 429) return res.status(429).json({ success: false, message: e.message });
    if (e.statusCode) return res.status(e.statusCode).json({ success: false, message: e.message });
    return next(e);
  }
});

router.get("/batch-templates", async (req, res) => {
  return res.json({
    success: true,
    data: Object.entries(BATCH_TEMPLATES).map(([key, v]) => ({ key, name: v.name })),
  });
});

module.exports = router;
