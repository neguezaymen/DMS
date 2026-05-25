const archiver = require("archiver");
const { PassThrough } = require("stream");
const { query } = require("../../config/db");
const { buildModernTextPdf } = require("../documents/demo-document-builder");
const {
  assertQuota,
  callOpenAI,
  recordGeneration,
} = require("./ai.service");

const MISSING_LABEL = "non renseigné";

const BATCH_TEMPLATES = {
  contrat: {
    name: "Contrat de travail",
    systemPrompt:
      "Tu es juriste RH. Rédige un contrat professionnel clair en français. Utilise uniquement les données fournies, sans laisser de placeholders.",
    userPromptTemplate:
      "Rédige un contrat pour {{nom}} ({{email}}), entreprise {{entreprise}}, poste {{poste}}, salaire {{montant}} €.\nContexte: {{contexte}}",
  },
  devis: {
    name: "Devis commercial",
    systemPrompt: "Tu es commercial B2B. Rédige un devis structuré. N'inclus aucun placeholder.",
    userPromptTemplate:
      "Devis pour {{nom}} / {{entreprise}} — montant {{montant}} € — {{contexte}}",
  },
  lettre: {
    name: "Lettre de motivation",
    systemPrompt: "Tu rédiges des lettres de motivation convaincantes. N'inclus aucun placeholder.",
    userPromptTemplate:
      "Lettre pour {{nom}}, candidature {{poste}} chez {{entreprise}}. {{contexte}}",
  },
};

const COLUMN_ALIASES = {
  nom: ["nom", "name", "prenom", "prénom", "client", "client_name"],
  email: ["email", "mail", "e-mail", "courriel"],
  entreprise: ["entreprise", "company", "societe", "société", "organisation", "organization"],
  montant: ["montant", "amount", "salaire", "price", "prix", "budget"],
  poste: ["poste", "role", "position", "job", "titre", "title"],
  contexte: ["contexte", "context", "description", "notes", "commentaire", "details"],
  sujet: ["sujet", "subject", "objet"],
};

function detectDelimiter(line) {
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}

function bufferToCsvText(buffer) {
  if (!buffer?.length) return "";
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le").replace(/^\uFEFF/, "").trim();
  }
  return buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
}

function parseCsvBuffer(buffer) {
  const text = bufferToCsvText(buffer);
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]);
  const headers = lines[0].split(delim).map((h) =>
    h
      .trim()
      .replace(/^\uFEFF/, "")
      .replace(/^"|"$/g, "")
  );
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(delim).map((p) => p.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = parts[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function normalizeRows(input) {
  if (Array.isArray(input)) return input;
  return [];
}

function normalizeHeaderKey(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/** Valeur CSV ou libellé de repli si vide / absente */
function coalesceValue(value) {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? MISSING_LABEL : s;
}

function pickFromNormalized(normalized, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeaderKey(alias);
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      const raw = normalized[key];
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
        return String(raw).trim();
      }
    }
  }
  return MISSING_LABEL;
}

/**
 * Variables pour substitution : colonnes CSV + alias FR/EN + champs AI Studio (prompt, context).
 */
function buildBatchVars(row) {
  const normalized = {};
  for (const [header, value] of Object.entries(row || {})) {
    const key = normalizeHeaderKey(header);
    if (!key) continue;
    normalized[key] = String(value ?? "").trim();
  }

  const vars = {
    nom: pickFromNormalized(normalized, COLUMN_ALIASES.nom),
    email: pickFromNormalized(normalized, COLUMN_ALIASES.email),
    entreprise: pickFromNormalized(normalized, COLUMN_ALIASES.entreprise),
    montant: pickFromNormalized(normalized, COLUMN_ALIASES.montant),
    poste: pickFromNormalized(normalized, COLUMN_ALIASES.poste),
    contexte: pickFromNormalized(normalized, COLUMN_ALIASES.contexte),
    sujet: pickFromNormalized(normalized, COLUMN_ALIASES.sujet),
    language: coalesceValue(row.language || row.lang || "FR"),
    tone: coalesceValue(row.tone || row.ton || "professionnel"),
    length: coalesceValue(row.length || row.longueur || "moyen"),
  };

  for (const [key, raw] of Object.entries(normalized)) {
    if (Object.prototype.hasOwnProperty.call(vars, key)) continue;
    vars[key] = coalesceValue(raw);
  }

  const dataBlock = [
    `nom: ${vars.nom}`,
    `email: ${vars.email}`,
    `entreprise: ${vars.entreprise}`,
    `montant: ${vars.montant}`,
    `poste: ${vars.poste}`,
    `contexte: ${vars.contexte}`,
  ].join("\n");

  vars.context = dataBlock;
  vars.prompt = dataBlock;
  if (vars.sujet === MISSING_LABEL) {
    vars.sujet = vars.nom !== MISSING_LABEL ? `Document pour ${vars.nom}` : "Document généré";
  }
  vars.subject = vars.sujet;

  return vars;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remplace {{cle}} et {cle} ; tout placeholder restant → "non renseigné".
 */
function applyBatchTemplate(templateText, vars) {
  let out = String(templateText || "");

  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const value = coalesceValue(vars[key]);
    out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, "gi"), value);
    out = out.replace(new RegExp(`\\{\\s*${escapeRegExp(key)}\\s*\\}`, "gi"), value);
  }

  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? coalesceValue(vars[key]) : MISSING_LABEL
  );
  out = out.replace(/\{\s*(\w+)\s*\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? coalesceValue(vars[key]) : MISSING_LABEL
  );

  return out;
}

function normalizeTemplateRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    name: row.name || "Document",
    system_prompt: row.system_prompt || row.systemPrompt || "",
    user_prompt_template: row.user_prompt_template || row.userPromptTemplate || "",
  };
}

function buildBatchUserPrompt(templateText, vars) {
  let prompt = applyBatchTemplate(templateText, vars);
  const stillHasPlaceholder = /\{\{?\s*\w+\s*\}?\}/.test(prompt);
  if (stillHasPlaceholder || !prompt.trim()) {
    prompt = `${prompt.trim()}\n\nDonnées client (CSV) :\n${vars.prompt || vars.context}`.trim();
  }
  return prompt;
}

function safeFilename(base, index) {
  const slug = String(base || `document-${index + 1}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .slice(0, 60);
  return `${slug || `doc-${index + 1}`}.pdf`;
}

async function textToPdfBuffer(title, body) {
  return buildModernTextPdf({
    title,
    subtitle: `Généré le ${new Date().toLocaleDateString("fr-FR")}`,
    body,
    badge: "BATCH IA",
    footerLabel: "DMS Workspace · Génération batch CSV",
  });
}

async function resolveTemplate({ templateId, templateKind }) {
  if (templateId) {
    const t = await query("SELECT * FROM ai_templates WHERE id = ? LIMIT 1", [Number(templateId)]);
    if (t.rows.length) return normalizeTemplateRow(t.rows[0]);
  }
  const preset = BATCH_TEMPLATES[templateKind] || BATCH_TEMPLATES.contrat;
  return normalizeTemplateRow({
    id: null,
    name: preset.name,
    system_prompt: preset.systemPrompt,
    user_prompt_template: preset.userPromptTemplate,
  });
}

async function generateBatchZip({ userId, rows, templateId, templateKind, model }) {
  const limited = rows.slice(0, 25);
  if (!limited.length) {
    const err = new Error("No rows to process");
    err.statusCode = 400;
    throw err;
  }

  await assertQuota(userId);
  const tpl = await resolveTemplate({ templateId, templateKind });
  const chosenModel = model || "gpt-3.5-turbo";
  const files = [];

  for (let i = 0; i < limited.length; i += 1) {
    await assertQuota(userId);
    const vars = buildBatchVars(limited[i]);
    const userPrompt = buildBatchUserPrompt(tpl.user_prompt_template, vars);
    const systemPrompt = applyBatchTemplate(tpl.system_prompt, vars);
    const batchPresetKind = tpl.id ? null : templateKind;

    const out = await callOpenAI({
      model: chosenModel,
      systemPrompt,
      userPrompt,
      templateName: tpl.name,
      templateKind: batchPresetKind || templateKind,
      batchVars: vars,
      batchPresetKind,
    });
    if (tpl.id) {
      await recordGeneration({
        userId,
        templateId: Number(tpl.id),
        action: "batch_generate",
        inputText: userPrompt,
        outputText: out.content,
        model: out.model,
        tokensUsed: out.tokensUsed,
      });
    }
    const body = applyBatchTemplate(out.content, vars);
    const pdf = await textToPdfBuffer(`${tpl.name} — ${vars.nom}`, body);
    files.push({
      name: safeFilename(vars.nom !== MISSING_LABEL ? vars.nom : tpl.name, i),
      buffer: pdf,
    });
  }

  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
    archive.pipe(stream);
    for (const f of files) {
      archive.append(f.buffer, { name: f.name });
    }
    archive.append(
      JSON.stringify(
        { generated: files.length, template: tpl.name, at: new Date().toISOString() },
        null,
        2
      ),
      { name: "manifest.json" }
    );
    archive.finalize();
  });
}

module.exports = {
  parseCsvBuffer,
  normalizeRows,
  buildBatchVars,
  applyBatchTemplate,
  generateBatchZip,
  BATCH_TEMPLATES,
  MISSING_LABEL,
};
